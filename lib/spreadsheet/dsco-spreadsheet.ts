import { PipelineErrorType } from '@dsco/ts-models';
import { DscoCatalogRow } from '@lib/spreadsheet';
import { DscoColumn } from './dsco-column';

/**
 * Represents a spreadsheet complete with:
 * • Catalogs as rows (@see DscoCatalogRow)
 * • Columns with dsco data validation
 *
 * Can be turned into a GoogleSpreadsheet by using .intoGoogleSpreadsheet();
 */
export class DscoSpreadsheet implements Iterable<DscoColumn> {
    static readonly USER_SHEET_NAME = 'Catalog Data';
    static readonly DATA_SHEET_NAME = 'ValidationData';
    static readonly DATA_SHEET_ID = 1;

    numColumns = 0;

    columns: Record<PipelineErrorType | 'none', DscoColumn[]> = {
        [PipelineErrorType.error]: [],
        [PipelineErrorType.warn]: [],
        [PipelineErrorType.info]: [],
        none: []
    };

    /**
     * Maps from a column's save name to the actual column.
     */
    columnsBySaveName: Record<string, DscoColumn> = {};

    /**
     * Maps from a column's display name to the actual column.
     */
    columnsByName: Record<string, DscoColumn> = {};

    /**
     * Holds all image-type columns
     */
    imageColumns: DscoColumn[] = [];

    rowData: DscoCatalogRow[] = [];

    * [Symbol.iterator](): IterableIterator<DscoColumn> {
        yield* this.columns.error;
        yield* this.columns.warn;
        yield* this.columns.info;
        yield* this.columns.none;
    }

    constructor(public spreadsheetName: string, private retailerId: number) {
    }

    addColumn(col: DscoColumn): void {
        this.columns[col.validation.required].push(col);
        this.columnsBySaveName[col.saveName] = col;
        this.columnsByName[col.name] = col;

        if (col.validation.format === 'image') {
            this.imageColumns.push(col);
        }

        this.numColumns++;
    }

    /**
     * Should be called before adding columns, as this ensures the image columns are added before the other columns
     */
    addCatalogRow(rowData: DscoCatalogRow): void {
        this.rowData.push(rowData);
    }
}
