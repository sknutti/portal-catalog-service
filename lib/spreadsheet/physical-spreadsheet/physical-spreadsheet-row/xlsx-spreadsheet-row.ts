import { CellValue, DscoColumn, DscoSpreadsheet } from '@lib/spreadsheet';
import { PhysicalSpreadsheetRow } from './physical-spreadsheet-row';
import { CellObject } from 'xlsx';

/**
 * An intermediate representation of a row in a xlsx sheet,
 * can be parsed into a DscoCatalogRow
 *
 * @see PhysicalSpreadsheetRow.parseCatalogRow
 */
export class XlsxSpreadsheetRow extends PhysicalSpreadsheetRow {

    constructor(protected cellValues: IterableIterator<[cell: CellObject, colName: string]>) {
        super();
    }


    protected *getCellValues(dscoSpreadsheet: DscoSpreadsheet): IterableIterator<[CellValue, DscoColumn]> {
        for (const [cell, colName] of this.cellValues) {
            const col = dscoSpreadsheet.columnsByName[colName];

            if (col) {
                yield [cell.v, col];
            }
        }
    }

    protected getIsModified(): boolean {
        return true; // we treat excel spreadsheet rows as always being modified
    }

}
