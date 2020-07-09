import { DscoSpreadsheet } from '@lib/dsco-spreadsheet';
import { generateScriptProjectForSheet } from '@lib/generate-script-project-for-sheet';
import { generateSpreadsheet } from '@lib/generate-spreadsheet';
import { prepareGoogleApis } from '@lib/google-api-utils';
import { sendWebsocketEvent } from '@lib/send-websocket-event';
import { SpreadsheetDynamoTable } from '@lib/spreadsheet-dynamo-table';
import { verifyCategorySpreadsheet } from '@lib/verify-category-spreadsheet';

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
        spreadsheetOrError.addCatalogRow({
            catalog,
            published: true
        });
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

    await SpreadsheetDynamoTable.putItem({spreadsheetId, categoryPath, retailerId, supplierId, scriptId, lastUpdateDate: new Date()});

    await cleanupGoogleApis();

    await sendWebsocketEvent('generateCatalogSpreadsheetSuccess', {
        categoryPath,
        url: DscoSpreadsheet.generateUrl(spreadsheetId),
        outOfDate: false
    }, supplierId);
}
