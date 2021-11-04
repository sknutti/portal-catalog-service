import { CellValue, DscoColumn, DscoSpreadsheet } from '@lib/spreadsheet';
import { PhysicalSpreadsheetRow } from './physical-spreadsheet-row';
import { CellObject } from '@sheet/image';

/**
 * An intermediate representation of a row in a csv sheet,
 * can be parsed into a DscoCatalogRow
 *
 * @see PhysicalSpreadsheetRow.parseCatalogRow
 */
export class CsvSpreadsheetRow extends PhysicalSpreadsheetRow {
    constructor(protected cellValues: Record<string, any>) {
        super();
    }

    protected *getCellValues(dscoSpreadsheet: DscoSpreadsheet): IterableIterator<[CellValue, DscoColumn]> {
        if (this.cellValues.sku) {
            yield [this.cellValues.sku, dscoSpreadsheet.columnsByName['sku']];
        }

        for (const [colName, cell] of Object.entries(this.cellValues)) {
            if (colName === 'sku' || colName === '') {
                continue;
            }

            const col = dscoSpreadsheet.columnsByName[colName];

            if (col) {
                yield [cell, col];
            }
        }
    }
}
