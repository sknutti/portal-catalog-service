import { APP_SCRIPT_VERSION, AppScriptsManager } from '@lib/app-script';
import {
    DscoCatalogRow,
    DscoSpreadsheet,
    generateSpreadsheet,
    GoogleSpreadsheet,
    SpreadsheetDynamoTable
} from '@lib/spreadsheet';
import { catalogItemSearch, prepareGoogleApis, sendWebsocketEvent } from '@lib/utils';
import { sheets_v4 } from 'googleapis';
import Schema$DeveloperMetadata = sheets_v4.Schema$DeveloperMetadata;

export interface UpdateCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    categoryPath: string;
}

export async function updateCategorySpreadsheet({categoryPath, retailerId, supplierId}: UpdateCategorySpreadsheetEvent): Promise<void> {
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

    const existingRows = DscoCatalogRow.fromExistingSheet(existingGoogleSpreadsheet, newDscoSpreadsheet, supplierId, retailerId, categoryPath, catalogItems);


    // We add any modified and non-empty rows to the new spreadsheet
    const alreadyAddedSkus = new Set<string>();
    for (const row of existingRows) {
        if (row.modified && !row.emptyRow) {
            if (row.catalog.sku) {
                alreadyAddedSkus.add(row.catalog.sku);
            }

            newDscoSpreadsheet.addCatalogRow(row);
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

    const {
        bandedRanges: existingBandedRanges,
        columnSaveNamesDeveloperMetadata: existingColumnSaveNamesDeveloperMetadata,
        numUserRows: existingNumUserRows,
        numUserCols: existingNumUserCols,
        numValidationRows: existingNumValidationRows,
        numValidationCols: existingNumValidationCols
    } = existingGoogleSpreadsheet;

    const existingDeveloperMetadata: {developerMetadata: Schema$DeveloperMetadata}[] = [
        {developerMetadata: existingColumnSaveNamesDeveloperMetadata},
      ...existingGoogleSpreadsheet.getModifiedRowDeveloperMetadata(),
    ];

    const {
        userSheetRowData,
        validationSheetRowData,
        bandedRanges: newBandedRanges,
        columnSaveNamesDeveloperMetadata: newColumnSaveNamesDeveloperMetadata,
        numUserRows: newNumUserRows,
        numUserCols: newNumUserCols,
        numValidationRows: newNumValidationRows,
        numValidationCols: newNumValidationCols
    } = newGoogleSpreadsheet;
    const newDeveloperMetadata: {developerMetadata: Schema$DeveloperMetadata}[] = [
        {developerMetadata: newColumnSaveNamesDeveloperMetadata},
        ...newGoogleSpreadsheet.getModifiedRowDeveloperMetadata(),
    ];

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: existingGoogleSpreadsheet.spreadsheetId,
        requestBody: {
            requests: [
                // Append rows / cols to either sheet if needed. (google will throw an error without this)
                ...[
                    {appendDimension: {sheetId: DscoSpreadsheet.USER_SHEET_ID, dimension: 'COLUMNS', length: newNumUserCols - existingNumUserCols}},
                    {appendDimension: {sheetId: DscoSpreadsheet.USER_SHEET_ID, dimension: 'ROWS', length: newNumUserRows - existingNumUserRows}},
                    {appendDimension: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, dimension: 'COLUMNS', length: newNumValidationCols - existingNumValidationCols}},
                    {appendDimension: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, dimension: 'ROWS', length: newNumValidationRows - existingNumValidationRows}},
                ].filter(req => req.appendDimension.length > 0),
                // Remove all existing banded ranges
                ...existingBandedRanges.map(({bandedRangeId}) => ({deleteBanding: {bandedRangeId}})),
                // Remove all developer metadata
                ...existingDeveloperMetadata.map(({developerMetadata}) => ({
                    deleteDeveloperMetadata: {dataFilter: {developerMetadataLookup: {metadataId: developerMetadata.metadataId}}}
                })),
                // Update the cells for the user sheet
                {
                    updateCells: {
                        range: {sheetId: DscoSpreadsheet.USER_SHEET_ID, startColumnIndex: 0, startRowIndex: 0},
                        fields: '*',
                        rows: userSheetRowData
                    }
                },
                // Same for the data sheet
                {
                    updateCells: {
                        range: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, startColumnIndex: 0, startRowIndex: 0},
                        fields: '*',
                        rows: validationSheetRowData
                    }
                },
                // Add the new developer metadata
                ...newDeveloperMetadata.map(({developerMetadata}) => ({createDeveloperMetadata: {developerMetadata}})),
                // Add the new banded ranges
                ...newBandedRanges.map(bandedRange => ({addBanding: {bandedRange}})),
                // Resize the columns that need it
                ...dimensionUpdates.map(dimension => ({updateDimensionProperties: dimension}))
            ]
        }
    });

    await cleanupGoogleApis();

    // Update the app script if necessary
    if (ddbSheet.scriptVersion !== APP_SCRIPT_VERSION) {
        await sendProgress(0.85, 'Updating validations...');
        await AppScriptsManager.updateExistingScriptProject(ddbSheet.scriptId, script);
    }

    await sendProgress(0.96, 'Cleaning up...');

    await SpreadsheetDynamoTable.markItemAsUpdated(supplierId, retailerId, categoryPath, APP_SCRIPT_VERSION, new Date());

    await sendWebsocketEvent('updateCatalogSpreadsheetSuccess', {categoryPath}, supplierId);
}
