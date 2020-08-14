import { APP_SCRIPT_VERSION, AppScriptsManager } from '@lib/app-script';
import {
    DscoCatalogRow,
    DscoSpreadsheet,
    generateSpreadsheet,
    SpreadsheetDynamoTable,
    verifyCategorySpreadsheet
} from '@lib/spreadsheet';
import { prepareGoogleApis, sendWebsocketEvent } from '@lib/utils';
import { drive_v3, sheets_v4 } from 'googleapis';
import Drive = drive_v3.Drive;
import Sheets = sheets_v4.Sheets;

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
        spreadsheetOrError.addCatalogRow(new DscoCatalogRow(catalog, false));
    }

    // Send the spreadsheet to google
    await sendProgress(0.66, 'Creating Spreadsheet...');

    const {sheets, drive, script, cleanupGoogleApis} = await prepareGoogleApis();

    const spreadsheetId = await sendSpreadsheetToGoogle(spreadsheetOrError, sheets, drive);

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

/**
 * Generates a google spreadsheet from the dsco spreadsheet
 * @returns the generated file id
 */
async function sendSpreadsheetToGoogle(dscoSpreadsheet: DscoSpreadsheet, sheets: Sheets, drive: Drive): Promise<string> {
    const {spreadsheet, dimensionUpdates} = await dscoSpreadsheet.intoGoogleSpreadsheet();

    const response = await sheets.spreadsheets.create({
        requestBody: spreadsheet
    });

    const fileId = response.data.spreadsheetId!;

    const bandedRanges = spreadsheet.bandedRanges;

    // For some annoying reason banding and dimensions need to be done after the fact.
    if (bandedRanges.length || dimensionUpdates.length) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: fileId,
            requestBody: {
                includeSpreadsheetInResponse: false,
                responseIncludeGridData: false,
                requests: [
                    ...bandedRanges.map(bandedRange => ({addBanding: {bandedRange}})),
                    ...dimensionUpdates.map(dimension => ({updateDimensionProperties: dimension}))
                ]
            }
        });
    }

    // Makes the spreadsheet public
    await drive.permissions.create({
        fileId,
        requestBody: {
            role: 'writer',
            type: 'anyone'
        }
    });

    return fileId;
}
