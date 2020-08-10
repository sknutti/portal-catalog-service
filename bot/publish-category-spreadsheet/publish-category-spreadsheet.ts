import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { DsError, keyBy, ProductStatus, XrayActionSeverity } from '@dsco/ts-models';
import { IS_MODIFIED_SAVE_DATA_KEY } from '@lib/app-script';
import { CoreCatalog } from '@lib/core-catalog';
import { GetWarehousesGearmanApi, GetWarehousesGearmanResponse, TinyWarehouse } from '@lib/requests';
import {
    DscoCatalogRow,
    DscoSpreadsheet,
    generateSpreadsheet,
    GoogleSpreadsheet,
    verifyCategorySpreadsheet
} from '@lib/spreadsheet';
import { prepareGoogleApis, sendWebsocketEvent } from '@lib/utils';
import { sheets_v4 } from 'googleapis';
import { SpreadsheetRowMessage } from '../../api';
import Schema$RowData = sheets_v4.Schema$RowData;

export interface PublishCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
}

const gearmanActionSuccess: Set<string> = new Set([
    'SAVED',
    'CREATED',
    'UPDATED',
    'SUCCESS'
]);

const VALIDATING_PROGRESS_START_PCT = 0.63;
const CLEANING_UP_PCT = 0.94;

export async function publishCategorySpreadsheet({categoryPath, retailerId, supplierId, userId}: PublishCategorySpreadsheetEvent): Promise<void> {
    const sendProgress = (progress: number, message: string) => {
        return sendWebsocketEvent('publishCatalogSpreadsheetProgress', {progress, message, categoryPath}, supplierId);
    };

    await sendProgress(0.2, 'Verifying spreadsheet is up to date...');

    // First, we verify the spreadsheet, refusing to publish if it is out of date
    const {savedSheet, outOfDate, catalogItems: existingCatalogItems} = await verifyCategorySpreadsheet(categoryPath, supplierId, retailerId);
    if (!savedSheet || outOfDate) {
        await sendWebsocketEvent('publishCatalogSpreadsheetFail', {
            categoryPath,
            reason: outOfDate ? 'out-of-date' : 'no-spreadsheet-found'
        }, supplierId);
        return;
    }

    await sendProgress(0.3, 'Loading Dsco schema & attribution data...');

    // Then we generate a DscoSpreadsheet, giving us column & validation info
    const dscoSpreadsheet = await generateSpreadsheet(supplierId, retailerId, categoryPath);
    if (!(dscoSpreadsheet instanceof DscoSpreadsheet)) {
        throw dscoSpreadsheet; // TODO: Handle this error
    }

    await sendProgress(0.45, 'Loading spreadsheet...');

    const {sheets, cleanupGoogleApis} = await prepareGoogleApis();
    const googleSpreadsheet = await GoogleSpreadsheet.loadFromGoogle(savedSheet.spreadsheetId, sheets);

    await sendProgress(VALIDATING_PROGRESS_START_PCT, 'Validating & saving rows...');

    const rowMessages: Record<number, SpreadsheetRowMessage[]> = {};
    const addRowMessage = (row: number, message: SpreadsheetRowMessage) => {
        let messages = rowMessages[row];
        if (!messages) {
            messages = rowMessages[row] = [];
        }
        messages.push(message);
    };

    // TODO: Report rows without skus as being ignored!
    // Only save the rows that haven't been published
    const unpublishedCatalogs = DscoCatalogRow.fromExistingSheet(googleSpreadsheet, dscoSpreadsheet, supplierId, retailerId, categoryPath).map((row, idx) => {
        return {row, rowIdx: idx + 1}; // + 1 because of header
    }).filter(row => !row.row.published);

    const rowIdxsWithErrors = new Set<number>();
    let numSuccessfulRows = 0;
    let numFailedRows = 0;

    if (unpublishedCatalogs.length) { // If there are any unpublished catalogs, try saving them
        const responses = await Promise.all(resolveCatalogsWithProgress(unpublishedCatalogs, existingCatalogItems, userId, supplierId, categoryPath));

        // Collect all of the error messages when trying to save them
        for (const {response, rowIdx} of responses) {
            const successfullySaved = gearmanActionSuccess.has(response.action);

            let hasErrorMessage = false;

            for (const msg of response.validation_messages || []) {
                addRowMessage(rowIdx + 1, msg);
                hasErrorMessage = hasErrorMessage || msg.messageType === XrayActionSeverity.error;
            }

            if (!successfullySaved && !hasErrorMessage) {
                const messages = response.messages?.length ? response.messages : ['Unable to save item.'];

                for (const message of messages) {
                    addRowMessage(rowIdx + 1, {message, messageType: XrayActionSeverity.error});
                }
            }

            if (successfullySaved) {
                numSuccessfulRows++;
            } else {
                numFailedRows++;

                rowIdxsWithErrors.add(rowIdx);
            }
        }

        // Update the checkbox values depending on which rows saved successfully.
        await sendProgress(CLEANING_UP_PCT, 'Cleaning up...');

        const numBoxesToBeChecked = googleSpreadsheet.numUserRows - 1; // minus 1 for the header
        const checkboxValues: Schema$RowData[] = [];
        for (let i = 0; i < numBoxesToBeChecked; i++) {
            checkboxValues.push({
                values: [{
                    userEnteredValue: {
                        boolValue: !rowIdxsWithErrors.has(i + 1) // plus 1 for header
                    }
                }]
            });
        }

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: savedSheet.spreadsheetId,
            requestBody: {
                requests: [
                    // Mark all rows as not modified
                    {
                        deleteDeveloperMetadata: {
                            dataFilter: {
                                developerMetadataLookup: {
                                    metadataKey: IS_MODIFIED_SAVE_DATA_KEY
                                }
                            }
                        }
                    },
                    {
                        updateCells: {
                            range: {
                                sheetId: DscoSpreadsheet.USER_SHEET_ID,
                                startColumnIndex: 0,
                                endColumnIndex: 1,
                                startRowIndex: 1
                            },
                            fields: 'userEnteredValue',
                            rows: checkboxValues
                        }
                    },
                    ...Array.from(rowIdxsWithErrors).map(idx => ({
                        createDeveloperMetadata: {developerMetadata: GoogleSpreadsheet.createIsModifiedDeveloperMetadata(idx)}
                    }))
                ]
            }
        });
    }

    await cleanupGoogleApis();

    await sendWebsocketEvent('publishCatalogSpreadsheetSuccess', {
        categoryPath,
        rowMessages,
        numSuccessfulRows,
        numFailedRows
    }, supplierId);
}

function resolveCatalogsWithProgress(unpublishedCatalogs: Array<{row: DscoCatalogRow, rowIdx: number}>, existingCatalogItems: CoreCatalog[],
                                     userId: number, supplierId: number, categoryPath: string): Array<Promise<{ response: ResolveExceptionGearmanApiResponse, rowIdx: number }>> {
    const existingItemMap = keyBy(existingCatalogItems, 'sku');

    const total = unpublishedCatalogs.length;
    let current = 0;

    let lastSendTime = 0;
    const THROTTLE_TIME = 300;

    let warehousesPromise: Promise<GetWarehousesGearmanResponse | DsError> | undefined;
    let warehouses: TinyWarehouse[] | undefined;

    return unpublishedCatalogs.map(async ({row, rowIdx}) => {
        const {catalog} = row;
        // Any product status other than pending requires both quantity_available and warehouses quantity.  This gives defaults of zero to both
        if (catalog.product_status !== ProductStatus.PENDING) {
            const existingItem = existingItemMap[catalog.sku!];
            catalog.quantity_available = existingItem?.quantity_available || 0;

            if (!warehouses) {
                warehousesPromise = warehousesPromise || new GetWarehousesGearmanApi(supplierId.toString()).submit();
                const resp = await warehousesPromise;
                warehouses = resp.success ? resp.warehouses : [];
            }

            handleWarehouseQuantity(catalog, warehouses, existingItem);
        }

        const response = await new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: supplierId!.toString(10),
                user_id: userId.toString(10)
            },
            params: catalog
        }).submit();

        current++;

        const now = Date.now();
        if (now - lastSendTime > THROTTLE_TIME) {
            lastSendTime = now;
            await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
                categoryPath,
                progress: VALIDATING_PROGRESS_START_PCT + ((CLEANING_UP_PCT - VALIDATING_PROGRESS_START_PCT) * (current / total)),
                message: `Validating & saving rows ${current}/${total}...`
            }, supplierId);
        }

        return {response, rowIdx};
    });
}

function handleWarehouseQuantity(item: CoreCatalog, warehouses: TinyWarehouse[], existing?: CoreCatalog): void {
    const existingWarehouses = new Set<string>();
    const newWarehouses = item.warehouses = item.warehouses || [];

    for (const existingWarehouse of existing?.warehouses || []) {
        if (!existingWarehouse) {
            continue;
        }

        existingWarehouses.add(existingWarehouse.warehouse_id);
        newWarehouses.push(existingWarehouse);
        if (!existingWarehouse.quantity) {
            existingWarehouse.quantity = 0;
        }
    }

    for (const warehouse of warehouses) {
        if (existingWarehouses.has(warehouse.warehouseId)) {
            continue;
        }

        existingWarehouses.add(warehouse.warehouseId);
        newWarehouses.push({
            quantity: 0,
            warehouse_id: warehouse.warehouseId,
            code: warehouse.code
        });
    }
}
