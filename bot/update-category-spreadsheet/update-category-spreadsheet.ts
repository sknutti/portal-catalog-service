import { UnexpectedError } from '@dsco/ts-models';
import { catalogItemSearch } from '@lib/catalog-item-search';
import { DscoCatalogRow } from '@lib/dsco-catalog-row';
import { DscoSpreadsheet } from '@lib/dsco-spreadsheet';
import { generateSpreadsheet } from '@lib/generate-spreadsheet';
import { prepareGoogleApis } from '@lib/google-api-utils';
import { GoogleSpreadsheet } from '@lib/google-spreadsheet';
import { SpreadsheetDynamoTable } from '@lib/spreadsheet-dynamo-table';
import { sheets_v4 } from 'googleapis';

export interface UpdateCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    categoryPath: string;
}

export async function updateCategorySpreadsheet({categoryPath, retailerId, supplierId}: UpdateCategorySpreadsheetEvent): Promise<void> {
    // First load the sheet information from dynamo, all catalog items, and the up-to-date DscoSpreadsheet
    const [ddbSheet, catalogItems, newDscoSpreadsheet] = await Promise.all([
        SpreadsheetDynamoTable.getItem(supplierId, retailerId, categoryPath),
        catalogItemSearch(supplierId, retailerId, categoryPath),
        generateSpreadsheet(supplierId, retailerId, categoryPath)
    ] as const);

    if (!ddbSheet) {
        throw new UnexpectedError('Could not find spreadsheet for params.', JSON.stringify({
            categoryPath,
            retailerId,
            supplierId
        }));
    }
    if (!(newDscoSpreadsheet instanceof DscoSpreadsheet)) {
        throw newDscoSpreadsheet;
    }


    // Then we load the existing google spreadsheet and extract the DscoCatalogRow data from it
    const {sheets, cleanupGoogleApis} = await prepareGoogleApis();

    const existingGoogleSpreadsheet = await GoogleSpreadsheet.loadFromGoogle(ddbSheet.spreadsheetId, sheets);

    const existingRows = DscoCatalogRow.fromExistingSheet(existingGoogleSpreadsheet, newDscoSpreadsheet, supplierId, retailerId, categoryPath);


    // We add any non-published rows to the new spreadsheet
    const alreadyAddedSkus = new Set<string>();
    for (const row of existingRows) {
        if (!row.published) {
            alreadyAddedSkus.add(row.catalog.sku!);
            newDscoSpreadsheet.addCatalogRow(row);
            console.error('Adding row', row);
        }
    }

    // Then add any remaining catalog items as published rows
    for (const item of catalogItems) {
        if (!alreadyAddedSkus.has(item.sku!)) {
            newDscoSpreadsheet.addCatalogRow(new DscoCatalogRow(item, true));
            console.error('Adding row', item);
        }
    }

    // Finally we convert the new DscoSpreadsheet into a GoogleSpreadsheet, and update the existing spreadsheet with the new data.
    const {spreadsheet: newGoogleSpreadsheet, dimensionUpdates} = await newDscoSpreadsheet.intoGoogleSpreadsheet();

    const {
        bandedRanges: existingBandedRanges,
        developerMetadata: existingDeveloperMetadata,
        numUserRows: existingNumUserRows,
        numUserCols: existingNumUserCols,
        numValidationRows: existingNumValidationRows,
        numValidationCols: existingNumValidationCols
    } = existingGoogleSpreadsheet;

    const {
        userSheetRowData,
        validationSheetRowData,
        bandedRanges: newBandedRanges,
        developerMetadata: newDeveloperMetadata,
        numUserRows: newNumUserRows,
        numUserCols: newNumUserCols,
        numValidationRows: newNumValidationRows,
        numValidationCols: newNumValidationCols
    } = newGoogleSpreadsheet;

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: existingGoogleSpreadsheet.spreadsheetId,
        requestBody: {
            requests: [
                // Append rows / cols to either sheet if needed.
                ...[
                    {appendDimension: {sheetId: DscoSpreadsheet.USER_SHEET_ID, dimension: 'COLUMNS', length: newNumUserCols - existingNumUserCols}},
                    {appendDimension: {sheetId: DscoSpreadsheet.USER_SHEET_ID, dimension: 'ROWS', length: newNumUserRows - existingNumUserRows}},
                    {appendDimension: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, dimension: 'COLUMNS', length: newNumValidationCols - existingNumValidationCols}},
                    {appendDimension: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, dimension: 'ROWS', length: newNumValidationRows - existingNumValidationRows}},
                ].filter(req => req.appendDimension.length > 0),
                // Remove all existing banded ranges
                ...existingBandedRanges.map(({bandedRangeId}) => ({deleteBanding: {bandedRangeId}})),
                // Remove all developer metadata
                ...existingDeveloperMetadata.map(({metadataId}) => ({deleteDeveloperMetadata: {dataFilter: {developerMetadataLookup: {metadataId}}}})),
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
                ...newDeveloperMetadata.map(developerMetadata => ({createDeveloperMetadata: {developerMetadata}})),
                // Add the new banded ranges
                ...newBandedRanges.map(bandedRange => ({addBanding: {bandedRange}})),
                // Resize the columns that need it
                ...dimensionUpdates.map(dimension => ({updateDimensionProperties: dimension}))
            ]
        }
    });

    await cleanupGoogleApis();

    console.error('All finished!!!');
}
