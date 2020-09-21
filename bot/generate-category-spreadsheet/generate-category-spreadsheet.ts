import { APP_SCRIPT_VERSION, AppScriptsManager } from '@lib/app-script';
import {
    DscoCatalogRow,
    DscoSpreadsheet,
    generateSpreadsheet,
    SpreadsheetDynamoTable,
    verifyCategorySpreadsheet
} from '@lib/spreadsheet';
import { prepareGoogleApis, sendWebsocketEvent } from '@lib/utils';

export interface GenerateCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    categoryPath: string;
}

export async function generateCategorySpreadsheet({categoryPath, retailerId, supplierId}: GenerateCategorySpreadsheetEvent): Promise<void> {
    const sendProgress = (progress: number, message: string) => {
        return sendWebsocketEvent('generateCatalogSpreadsheetProgress', {progress, message, categoryPath}, supplierId);
    };

    // First, check for an existing spreadsheet
    await sendProgress(0.2, 'Checking for existing spreadsheet...');

    const {savedSheet, outOfDate, catalogItems} = await verifyCategorySpreadsheet(categoryPath, supplierId, retailerId);
    if (savedSheet) { // If found, return it.
        await sendWebsocketEvent('generateCatalogSpreadsheetSuccess', {
            categoryPath,
            url: DscoSpreadsheet.generateUrl(savedSheet.spreadsheetId),
            outOfDate
        }, supplierId);

        return;
    }

    // Otherwise, generate a DscoSpreadsheet
    await sendProgress(0.53, 'Loading Dsco schema & attribution data...');

    const spreadsheetOrError = await generateSpreadsheet(supplierId, retailerId, categoryPath);

    if (!(spreadsheetOrError instanceof DscoSpreadsheet)) {
        // TODO: Handle this
        throw spreadsheetOrError;
    }

    for (const catalog of catalogItems) { // Populate the spreadsheet with all of their catalog items
        spreadsheetOrError.addCatalogRow(new DscoCatalogRow(catalog, false, true));
    }

    // Send the spreadsheet to google
    await sendProgress(0.66, 'Creating Spreadsheet...');

    const {sheets, drive, script, cleanupGoogleApis} = await prepareGoogleApis();

    const {spreadsheet: googleSpreadsheet, dimensionUpdates} = await spreadsheetOrError.intoGoogleSpreadsheet();

    const spreadsheetId = await googleSpreadsheet.sendToGoogle(sheets, drive, dimensionUpdates);

    // Generate a google apps scripts project for the spreadsheet.
    await sendProgress(0.85, 'Adding validation to spreadsheet...');

    const scriptId = await AppScriptsManager.generateScriptProjectForSheet(spreadsheetId, spreadsheetOrError.spreadsheetName, script);

    await SpreadsheetDynamoTable.putItem({
        spreadsheetId,
        categoryPath,
        retailerId,
        supplierId,
        scriptId,
        scriptVersion: APP_SCRIPT_VERSION,
        lastUpdateDate: new Date()
    });

    await cleanupGoogleApis();

    // Return the newly created spreadsheet url.
    await sendWebsocketEvent('generateCatalogSpreadsheetSuccess', {
        categoryPath,
        url: DscoSpreadsheet.generateUrl(spreadsheetId),
        outOfDate: false
    }, supplierId);
}
