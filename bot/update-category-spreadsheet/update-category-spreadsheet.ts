import { keyBy } from '@dsco/ts-models';
import { APP_SCRIPT_VERSION, AppScriptsManager } from '@lib/app-script';
import {
    DscoCatalogRow,
    DscoSpreadsheet,
    generateSpreadsheet,
    GoogleSpreadsheet,
    SpreadsheetDynamoTable,
    XlsxSpreadsheet
} from '@lib/spreadsheet';
import { catalogItemSearch, prepareGoogleApis, sendWebsocketEvent } from '@lib/utils';

export interface UpdateCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    categoryPath: string;

    /**
     * Optional base64 xlsx data.  If provided will override any data on the google sheet
     */
    xlsxSheetBase64?: string;

    /**
     * Whether or not to revert old changes
     */
    revert: boolean;
}

export async function updateCategorySpreadsheet({categoryPath, retailerId, supplierId, revert, xlsxSheetBase64}: UpdateCategorySpreadsheetEvent): Promise<void> {
    const sendProgress = (progress: number, message: string) => {
        return sendWebsocketEvent('updateCatalogSpreadsheetProgress', {progress, message, categoryPath}, supplierId);
    };
    await sendProgress(0.3, 'Loading catalogs & attributions...');

    // First load the sheet information from dynamo, all catalog items, and generate an up-to-date DscoSpreadsheet
    const [ddbSheet, catalogItems, newDscoSpreadsheet] = await Promise.all([
        SpreadsheetDynamoTable.getItem(supplierId, retailerId, categoryPath),
        catalogItemSearch(supplierId, retailerId, categoryPath),
        generateSpreadsheet(supplierId, retailerId, categoryPath)
    ] as const);

    if (!ddbSheet) {
        throw new Error(`Could not find spreadsheet for params: ${JSON.stringify({
            categoryPath,
            retailerId,
            supplierId
        })}`);
    }
    if (!(newDscoSpreadsheet instanceof DscoSpreadsheet)) {
        throw new Error(`Failed generating DscoSpreadsheet: ${JSON.stringify(newDscoSpreadsheet)}`);
    }


    await sendProgress(0.56, 'Loading existing spreadsheet...');

    // Then we load the existing google spreadsheet and extract the DscoCatalogRow data from it
    const {sheets, script, cleanupGoogleApis} = await prepareGoogleApis();

    const existingGoogleSpreadsheet = await GoogleSpreadsheet.loadFromGoogle(ddbSheet.spreadsheetId, sheets);

    const existingRows = existingGoogleSpreadsheet.extractCatalogRows(newDscoSpreadsheet, supplierId, retailerId, categoryPath, keyBy(catalogItems, 'sku'));

    // We keep track of which skus we've added to the updated dsco spreadsheet so there aren't any duplicates
    const alreadyAddedSkus = new Set<string>();

    const xlsxSheet = xlsxSheetBase64 ? XlsxSpreadsheet.fromBase64(xlsxSheetBase64) : undefined;
    if (xlsxSheet) { // Add the catalog data from the xlsx sheet
        const xlsxRows = xlsxSheet.extractCatalogRows(newDscoSpreadsheet, supplierId, retailerId, categoryPath, keyBy(catalogItems, 'sku'));

        for await (const row of xlsxRows) {
            if (!row.emptyRow && row.catalog.sku) {
                alreadyAddedSkus.add(row.catalog.sku);
                newDscoSpreadsheet.addCatalogRow(row);
            }
        }
    }

    if (!revert) { // If we aren't reverting, add any modified and non-empty rows
        for await (const row of existingRows) {
            if (row.modified && !row.emptyRow) {
                if (row.catalog.sku) {
                    alreadyAddedSkus.add(row.catalog.sku);
                }

                newDscoSpreadsheet.addCatalogRow(row);
            }
        }
    }

    // Then add any remaining catalog items as unmodified rows
    for (const item of catalogItems) {
        if (!alreadyAddedSkus.has(item.sku!)) {
            newDscoSpreadsheet.addCatalogRow(new DscoCatalogRow(item, false, true));
        }
    }

    await sendProgress(0.71, 'Updating spreadsheet...');

    // Finally we convert the new DscoSpreadsheet into a GoogleSpreadsheet, and update the existing spreadsheet with the new data.
    const {spreadsheet: newGoogleSpreadsheet, dimensionUpdates} = newDscoSpreadsheet.intoGoogleSpreadsheet();

    await existingGoogleSpreadsheet.migrateInPlace(newGoogleSpreadsheet, dimensionUpdates, sheets);

    // Update the app script if necessary
    if (ddbSheet.scriptVersion !== APP_SCRIPT_VERSION) {
        await sendProgress(0.85, 'Updating validations...');
        await AppScriptsManager.updateExistingScriptProject(ddbSheet.scriptId, script);
    }

    await cleanupGoogleApis();

    await sendProgress(0.96, 'Cleaning up...');

    await SpreadsheetDynamoTable.markItemAsUpdated(supplierId, retailerId, categoryPath, APP_SCRIPT_VERSION, new Date());

    await sendWebsocketEvent('updateCatalogSpreadsheetSuccess', {categoryPath}, supplierId);
}
