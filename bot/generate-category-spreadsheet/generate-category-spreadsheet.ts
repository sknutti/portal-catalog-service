import { DscoSpreadsheet } from '@lib/dsco-spreadsheet';
import { generateScriptProjectForSheet } from '@lib/generate-script-project-for-sheet';
import { generateSpreadsheet } from '@lib/generate-spreadsheet';
import { prepareGoogleApis } from '@lib/google-api-utils';
import { sendWebsocketEvent } from '@lib/send-websocket-event';
import { SpreadsheetDynamoTable } from '@lib/spreadsheet-dynamo-table';

export interface GenerateCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    categoryPath: string;
}

const spreadsheetDynamoTable = new SpreadsheetDynamoTable();

export async function generateCategorySpreadsheet({categoryPath, retailerId, supplierId}: GenerateCategorySpreadsheetEvent): Promise<void> {
    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.2,
        message: 'Checking for existing spreadsheet...'
    }, supplierId);

    const existing = await spreadsheetDynamoTable.getItem(supplierId, retailerId, categoryPath);
    if (existing) {
        await sendWebsocketEvent('generateCatalogSpreadsheetSuccess', {
            categoryPath,
            url: DscoSpreadsheet.generateUrl(existing.spreadsheetId)
        }, supplierId);

        return;
    }

    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.25,
        message: 'Loading Dsco schema & attribution data...'
    }, supplierId);
    const spreadsheetOrError = await generateSpreadsheet(supplierId, retailerId, categoryPath);

    if (!(spreadsheetOrError instanceof DscoSpreadsheet)) {
        // TODO: Handle this
        throw spreadsheetOrError;
    }

    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.66,
        message: 'Creating Spreadsheet...'
    }, supplierId);

    const {sheets, drive, script, cleanupGoogleApis} = await prepareGoogleApis();

    const spreadsheetId = await spreadsheetOrError.createSpreadsheet(sheets, drive);

    await sendWebsocketEvent('generateCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.85,
        message: 'Adding validation to spreadsheet...'
    }, supplierId);

    const scriptId = await generateScriptProjectForSheet(spreadsheetId, spreadsheetOrError.spreadsheetName, script);

    await spreadsheetDynamoTable.putItem({spreadsheetId, categoryPath, retailerId, supplierId, scriptId});

    await cleanupGoogleApis();

    await sendWebsocketEvent('generateCatalogSpreadsheetSuccess', {
        categoryPath,
        url: DscoSpreadsheet.generateUrl(spreadsheetId)
    }, supplierId);
}
