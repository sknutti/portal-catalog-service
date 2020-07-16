import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { keyBy, ProductStatus, XrayActionSeverity } from '@dsco/ts-models';
import { IS_MODIFIED_SAVE_DATA_KEY } from '@lib/app-script';
import { CoreCatalog } from '@lib/core-catalog';
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
    'SUCCESS',
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

    // Only save the rows that haven't been published
    const unpublishedCatalogs = DscoCatalogRow.fromExistingSheet(googleSpreadsheet, dscoSpreadsheet, supplierId, retailerId, categoryPath).filter(
      row => !row.published
    );

    const responses = await Promise.all(resolveCatalogsWithProgress(unpublishedCatalogs, existingCatalogItems, userId, supplierId, categoryPath));

    let rowNum = 2; // row 1 is the header
    for (const response of responses) {
        const successfullySaved = gearmanActionSuccess.has(response.action);

        let hasErrorMessage = false;

        for (const msg of response.validation_messages || []) {
            addRowMessage(rowNum, msg);
            hasErrorMessage = hasErrorMessage || msg.messageType === XrayActionSeverity.error;
        }

        if (!successfullySaved && !hasErrorMessage) {
            const messages = response.messages?.length ? response.messages : ['Unable to save item.'];

            for (const message of messages) {
                addRowMessage(rowNum, {message, messageType: XrayActionSeverity.error});
            }
        }

        rowNum++;
    }

    await sendProgress(CLEANING_UP_PCT, 'Cleaning up...');

    const numBoxesToBeChecked = googleSpreadsheet.numUserRows - 1; // minus 1 for the header
    const trueValues: Schema$RowData[] = [];
    for (let i = 0; i < numBoxesToBeChecked; i++) {
        trueValues.push({
            values: [{userEnteredValue: {boolValue: true}}]
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
                        range: {sheetId: DscoSpreadsheet.USER_SHEET_ID, startColumnIndex: 0, endColumnIndex: 1, startRowIndex: 1},
                        fields: 'userEnteredValue',
                        rows: trueValues
                    }
                }
            ]
        }
    });
    await cleanupGoogleApis();

    await sendWebsocketEvent('publishCatalogSpreadsheetSuccess', {
        categoryPath,
        rowMessages
    }, supplierId);
}

function resolveCatalogsWithProgress(unpublishedCatalogs: DscoCatalogRow[], existingCatalogItems: CoreCatalog[],
                                     userId: number, supplierId: number, categoryPath: string): Array<Promise<ResolveExceptionGearmanApiResponse>> {
    const existingItemMap = keyBy(existingCatalogItems, 'sku');

    const total = unpublishedCatalogs.length;
    let current = 0;

    let lastSendTime = 0;
    const THROTTLE_TIME = 300;

    return unpublishedCatalogs.map(async ({catalog}) => {
        // Any product status other than pending requires a quantity available.  Default to zero if there isn't one.
        if (catalog.product_status !== ProductStatus.PENDING && !catalog.quantity_available) {
            catalog.quantity_available = existingItemMap[catalog.sku!]?.quantity_available || 0;
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

        return response;
    });
}
