import { CoreCatalog, createCoreCatalog } from '@lib/core-catalog';
import { DscoSpreadsheet } from '@lib/dsco-spreadsheet';
import { GoogleSpreadsheet } from '@lib/google-spreadsheet';
import { APP_SCRIPT_SAVE_DATA_KEY, AppScriptSaveData } from '@lib/app-script-save-data';
import { sheets_v4 } from 'googleapis';
import Sheets = sheets_v4.Sheets;
import Schema$RowData = sheets_v4.Schema$RowData;

/**
 * Represent's one row's data - a catalog and whether or not that catalog has been published.
 *
 * Can be extracted from a GoogleSpreadsheet, and added to a DscoSpreadsheet.
 */
export class DscoCatalogRow {
    constructor(public catalog: CoreCatalog, public published: boolean) {
    }

    /**
     * Parses the google spreadsheet, turning it into DscoCatalogRow data using the columns from the dscoSpreadsheet
     *
     * @returns the parsed DscoCatalogRows
     */
    static fromExistingSheet(
      googleSpreadsheet: GoogleSpreadsheet,
      dscoSpreadsheet: DscoSpreadsheet,
      supplierId: number,
      retailerId: number,
      categoryPath: string
    ): DscoCatalogRow[] {
        const result: DscoCatalogRow[] = [];

        const {userSheetRowData, saveData} = googleSpreadsheet;
        const modifiedRows = new Set([1, 2]);

        for (let rowIdx = 1; rowIdx < userSheetRowData.length; rowIdx++) { // Start at 1 to skip the header row
            const row = userSheetRowData[rowIdx]?.values || [];

            const {catalog} = createCoreCatalog(supplierId, retailerId, categoryPath);
            const dscoCatalogRow = new DscoCatalogRow(catalog, !modifiedRows.has(rowIdx));

            for (let colIdx = 0; colIdx < row.length; colIdx++) {
                const cell = row[colIdx];
                const colSaveName = saveData.colSaveNames[colIdx];
                const dscoCol = dscoSpreadsheet.columnsBySaveName[colSaveName];
                if (!dscoCol) {
                    continue;
                }

                dscoCol.readDataFromExistingCell(cell, dscoCatalogRow, retailerId);
            }

            // Keep rows that have at least a sku
            if (catalog.sku) {
                result.push(dscoCatalogRow);
            }
        }

        return result;
    }
}
