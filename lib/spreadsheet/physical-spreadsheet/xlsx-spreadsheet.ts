import { CellObject, Range, read, utils, WorkBook, WorkSheet, write, writeFile } from '@sheet/image';
import { PhysicalSpreadsheet } from './physical-spreadsheet';
import { XlsxSpreadsheetRow } from './physical-spreadsheet-row';

export class XlsxSpreadsheet extends PhysicalSpreadsheet {
    private range: Range = utils.decode_range(this.sheet['!ref']!); // xlsx always have ref;

    // a map from column number to the header for that column
    private readonly headerNames: Map<number, string>;
    private readonly colIterationOrder: number[];

    constructor(
      private workbook: WorkBook,
      private sheet: WorkSheet
    ) {
        super();

        const [headerNames, colIterationOrder] = this.parseHeaderNames();
        this.headerNames = headerNames;
        this.colIterationOrder = colIterationOrder;

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

    numDataRows(): number {
        return this.range.e.r - this.range.s.r; // minus 1 for the header
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
     * Also returns the order to iterate the columns in, ensuring sku is always first
     */
    private parseHeaderNames(): [names: Map<number, string>, colOrder: number[]] {
        const names = new Map<number, string>();
        const colOrder = [-1]; // This negative one is a placeholder to hold the sku column

        for (let colNum = this.range.s.c; colNum <= this.range.e.c; colNum++) {
            const cell = this.getCell(this.range.s.r, colNum);

            if (cell && typeof cell.v === 'string') {
                names.set(colNum, cell.v);

                if (cell.v === 'sku') {
                    colOrder[0] = colNum;
                } else {
                    colOrder.push(colNum);
                }
            }
        }

        // If we didn't find a sku column, remove the placeholder for it
        if (colOrder[0] === -1) {
            colOrder.splice(0, 1);
        }

        return [names, colOrder];
    }

    private getCell(rowNum: number, colNum: number): CellObject | undefined {
        const nextCellAddr = utils.encode_cell({
            r: rowNum,
            c: colNum
        });

        return this.sheet[nextCellAddr] as CellObject | undefined;
    }

    private *rowIterator(rowNum: number): IterableIterator<[cell: CellObject, colName: string]> {
        for (const colNum of this.colIterationOrder) {
            const cell = this.getCell(rowNum, colNum);

            if (cell) {
                yield [cell, this.headerNames.get(colNum)!];
            }
        }
    }
}
