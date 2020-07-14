import { DscoCatalogRow } from '@lib/dsco-catalog-row';
import { DscoSpreadsheet } from '@lib/dsco-spreadsheet';
import { generateScriptProjectForSheet } from '@lib/generate-script-project-for-sheet';
import { generateSpreadsheet } from '@lib/generate-spreadsheet';
import { prepareGoogleApis } from '@lib/google-api-utils';
import { sendWebsocketEvent } from '@lib/send-websocket-event';
import { SpreadsheetDynamoTable } from '@lib/spreadsheet-dynamo-table';
import { verifyCategorySpreadsheet } from '@lib/verify-category-spreadsheet';
import { drive_v3, sheets_v4 } from 'googleapis';
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;
import Sheets = sheets_v4.Sheets;
import Drive = drive_v3.Drive;

export interface GenerateCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    categoryPath: string;
}

export async function generateCategorySpreadsheet({categoryPath, retailerId, supplierId}: GenerateCategorySpreadsheetEvent): Promise<void> {
    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.2,
        message: 'Checking for existing spreadsheet...'
    }, supplierId);

    const {savedSheet, outOfDate, catalogItems} = await verifyCategorySpreadsheet(categoryPath, supplierId, retailerId);
    if (savedSheet) {
        await sendWebsocketEvent('generateCatalogSpreadsheetSuccess', {
            categoryPath,
            url: DscoSpreadsheet.generateUrl(savedSheet.spreadsheetId),
            outOfDate
        }, supplierId);

        return;
    }

    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.53,
        message: 'Loading Dsco schema & attribution data...'
    }, supplierId);

    const spreadsheetOrError = await generateSpreadsheet(supplierId, retailerId, categoryPath);

    if (!(spreadsheetOrError instanceof DscoSpreadsheet)) {
        // TODO: Handle this
        throw spreadsheetOrError;
    }

    for (const catalog of catalogItems) {
        spreadsheetOrError.addCatalogRow(new DscoCatalogRow(catalog, true));
    }

    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.66,
        message: 'Creating Spreadsheet...'
    }, supplierId);

    const {sheets, drive, script, cleanupGoogleApis} = await prepareGoogleApis();

    const spreadsheetId = await createGoogleSpreadsheet(spreadsheetOrError, sheets, drive);

    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.85,
        message: 'Adding validation to spreadsheet...'
    }, supplierId);

    const scriptId = await generateScriptProjectForSheet(spreadsheetId, spreadsheetOrError.spreadsheetName, script);

    await SpreadsheetDynamoTable.putItem({spreadsheetId, categoryPath, retailerId, supplierId, scriptId, lastUpdateDate: new Date()});

    await cleanupGoogleApis();

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
async function createGoogleSpreadsheet(dscoSpreadsheet: DscoSpreadsheet, sheets: Sheets, drive: Drive): Promise<string> {
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
