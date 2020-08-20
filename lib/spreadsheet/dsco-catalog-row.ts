import { CoreCatalog, createCoreCatalog } from '@lib/core-catalog';
import { DscoSpreadsheet, GoogleSpreadsheet } from '@lib/spreadsheet';

/**
 * Represent's one row's data - a catalog and whether or not that catalog has been modified.
 *
 * Can be extracted from a GoogleSpreadsheet, and added to a DscoSpreadsheet.
 */
export class DscoCatalogRow {
    emptyRow = false;

    constructor(public catalog: CoreCatalog, public modified: boolean, public savedToDsco: boolean) {
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
      categoryPath: string,
      existingCatalogItems: CoreCatalog[]
    ): DscoCatalogRow[] {
        const existingSkus = new Set<string>();
        existingCatalogItems.forEach(item => item.sku && existingSkus.add(item.sku));

        const result: DscoCatalogRow[] = [];

        const {userSheetRowData, modifiedRowIndexes, columnSaveNames} = googleSpreadsheet;

        for (let rowIdx = 1; rowIdx < userSheetRowData.length; rowIdx++) { // Start at 1 to skip the header row
            const row = userSheetRowData[rowIdx]?.values || [];

            const {catalog} = createCoreCatalog(supplierId, retailerId, categoryPath);
            const dscoCatalogRow = new DscoCatalogRow(catalog, modifiedRowIndexes.has(rowIdx), !!catalog.sku && existingSkus.has(catalog.sku));

            let hasValue = false;
            for (let colIdx = 0; colIdx < row.length; colIdx++) {
                const cell = row[colIdx];
                const colSaveName = columnSaveNames[colIdx];
                const dscoCol = dscoSpreadsheet.columnsBySaveName[colSaveName];
                if (!dscoCol) {
                    continue;
                }

                if (dscoCol.readDataFromExistingCell(cell, dscoCatalogRow, retailerId) === 'hasValue') {
                    hasValue = true;
                }
            }

            dscoCatalogRow.emptyRow = !hasValue;
            result.push(dscoCatalogRow);
        }

        return result;
    }
}
