import { PipelineErrorType } from '@dsco/ts-models';
import { DscoCatalogRow } from '@lib/spreadsheet';
import { DscoColumn } from './dsco-column';

/**
 * This is the "source of truth" spreadsheet for a given category.  It's used to parse, generate, and validate user spreadsheets.
 * Can be converted to or from a `PhysicalSpreadsheet` (csv or xlsx)
 *
 * A DscoSpreadsheet is primarily two pieces of data:
 * • A list of DscoColumns that contain validation rules & field names
 * • A list of DscoCatalogRows - the actual Catalog data stored in the spreadsheet
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
        none: [],
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

    *[Symbol.iterator](): IterableIterator<DscoColumn> {
        yield* this.columns.error;
        yield* this.columns.warn;
        yield* this.columns.info;
        yield* this.columns.none;
    }

    constructor(public spreadsheetName: string) {}

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
