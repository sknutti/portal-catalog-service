import { XlsxSpreadsheetRow } from './physical-spreadsheet-row';
import { PhysicalSpreadsheet } from './physical-spreadsheet';
import { CellObject, Range, read, utils, WorkBook, WorkSheet, write, writeFile } from '@sheet/image';

export class XlsxSpreadsheet extends PhysicalSpreadsheet {
    private range: Range = utils.decode_range(this.sheet['!ref']!); // xlsx always have ref;

    // a map from column number to the header for that column
    private headerNames: Map<number, string> = this.parseHeaderNames();

    constructor(
      private workbook: WorkBook,
      private sheet: WorkSheet
    ) {
        super();
    }

    static fromBuffer(buffer: Buffer): XlsxSpreadsheet | undefined {
        // TODO: this could be slow, perhaps move to child process?
        const file = read(buffer, {
            type: 'buffer',
            cellDates: true,
            cellFormula: false,
            cellHTML: false
        });

        const sheet = file?.SheetNames?.length ? file.Sheets[file.SheetNames[0]] : undefined;

        return sheet ? new XlsxSpreadsheet(file, sheet) : undefined;
    }

    toBuffer(): Buffer {
        return write(this.workbook, {
            type: 'buffer',
        });
    }

    toFile(name = 'output.xlsx'): void {
        writeFile(this.workbook, `/Users/aidan/ds/portal-catalog-service/${name}`);
    }

    *rows(startRowIdx?: number): IterableIterator<XlsxSpreadsheetRow> {
        startRowIdx = startRowIdx ?? this.range.s.r + 1; // + 1 to skip the header row

        console.error(startRowIdx, this.range);
        for (let rowNum = startRowIdx; rowNum <= this.range.e.r; rowNum++) {
            yield new XlsxSpreadsheetRow(this.rowIterator(rowNum));
        }
    }

    /**
     * Returns a map from column number to the header for that column
     */
    private parseHeaderNames(): Map<number, string> {
        const result = new Map<number, string>();

        for (let colNum = this.range.s.c; colNum <= this.range.e.c; colNum++) {
            const cell = this.getCell(this.range.s.r, colNum);

            if (cell && typeof cell.v === 'string') {
                result.set(colNum, cell.v);
            }
        }

        return result;
    }

    private getCell(rowNum: number, colNum: number): CellObject | undefined {
        const nextCellAddr = utils.encode_cell({
            r: rowNum,
            c: colNum
        });

        return this.sheet[nextCellAddr] as CellObject | undefined;
    }

    private *rowIterator(rowNum: number): IterableIterator<[cell: CellObject, colName: string]> {
        for (const [colNum, colName] of this.headerNames.entries()) {
            const cell = this.getCell(rowNum, colNum);

            if (cell) {
                yield [cell, colName];
            }
        }
    }
}
