import { CatalogResolver } from '@bot/publish-category-spreadsheet/catalog-resolver';
import { IS_MODIFIED_SAVE_DATA_KEY } from '@lib/app-script';
import {
    DscoCatalogRow,
    DscoSpreadsheet,
    generateSpreadsheet,
    GoogleSpreadsheet,
    verifyCategorySpreadsheet
} from '@lib/spreadsheet';
import { prepareGoogleApis, sendWebsocketEvent } from '@lib/utils';
import { sheets_v4 } from 'googleapis';
import Schema$RowData = sheets_v4.Schema$RowData;

export interface PublishCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
}


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

    // TODO: Report rows without skus as being ignored!
    // Only save the rows that have been modified
    const catalogRows = DscoCatalogRow.fromExistingSheet(googleSpreadsheet, dscoSpreadsheet, supplierId, retailerId, categoryPath, existingCatalogItems);
    const resolver = new CatalogResolver(catalogRows, existingCatalogItems, userId, supplierId, categoryPath, VALIDATING_PROGRESS_START_PCT, CLEANING_UP_PCT);
    const resolvedRows = await resolver.resolveCatalogsWithProgress();
    const {numFailedRows, numSuccessfulRows, numEmptyRows, rowMessages, rowIdxsWithErrors} = resolver;

    const numModifiedRows = numSuccessfulRows + numFailedRows + numEmptyRows;

    if (numModifiedRows) {
        // If there are any modified catalogs,
        // update the checkbox values depending on which rows saved successfully.
        // also updates the skus to be immutable
        await sendProgress(CLEANING_UP_PCT, 'Cleaning up...');

        const checkboxAndSkuValues: Schema$RowData[] = [];
        for (const {row, hasError, existingSku} of resolvedRows) {
            checkboxAndSkuValues.push({
                values: [{
                    userEnteredValue: {
                        boolValue: hasError // check the "is modified" checkbox if we couldn't save
                    },
                    dataValidation: {
                        condition: {type: 'BOOLEAN'},
                        showCustomUi: true,
                        strict: true
                    }
                }, {
                    userEnteredValue: {
                        stringValue: row.catalog.sku,
                    },
                    // Make the sku immutable if it already existed or was newly created
                    dataValidation: row.catalog.sku && (!hasError || existingSku) ? {
                        condition: {
                            type: 'CUSTOM_FORMULA',
                            values: [{userEnteredValue: `=EQ(INDIRECT("RC", false), "${row.catalog.sku}")`}]
                        },
                        strict: true,
                        inputMessage: `Cannot modify a sku that has been saved to Dsco.  Must equal ${row.catalog.sku}.`
                    } : undefined
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
                                endColumnIndex: 2,
                                startRowIndex: 1
                            },
                            fields: 'userEnteredValue,dataValidation',
                            rows: checkboxAndSkuValues
                        }
                    },
                    ...rowIdxsWithErrors.map(idx => ({
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
        numFailedRows,
        numEmptyRows
    }, supplierId);
}
