import { PhysicalSpreadsheet } from '@lib/spreadsheet';
import { CsvSpreadsheetRow } from '@lib/spreadsheet/physical-spreadsheet/physical-spreadsheet-row/csv-spreadsheet-row';
import { isInRange } from '@lib/utils';
import parse from 'csv-parse/lib/sync';

export class CsvSpreadsheet extends PhysicalSpreadsheet {
    parsed: Record<string, any>[];

    constructor(body: Buffer) {
        super();

        // TODO: We probably want to stream this in the future.  Sync works well enough for now
        this.parsed = parse(body, {columns: true, skip_empty_lines: false, bom: true});
    }

    * rows(): IterableIterator<CsvSpreadsheetRow> {
        for (const record of this.parsed) {
            yield new CsvSpreadsheetRow(record);
        }
    }

    skus(fromRowIdx?: number, toRowIdx?: number): string[] {
        return this.parsed.map((row) => row.sku).filter((sku, i) => {
            // +1 for header row
            return !!sku && isInRange(i + 1, fromRowIdx, toRowIdx);
        });
    }

    numDataRows(): number {
        return this.parsed.length;
    }
}
