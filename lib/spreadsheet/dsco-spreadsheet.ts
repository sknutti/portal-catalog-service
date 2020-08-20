import { PipelineErrorType } from '@dsco/ts-models';
import { COLUMN_SAVE_NAMES_SAVE_DATA_KEY, UserDataSheetId } from '@lib/app-script';
import { DscoCatalogRow, GoogleSpreadsheet } from '@lib/spreadsheet';
import { sheets_v4 } from 'googleapis';
import { DscoColumn } from './dsco-column';
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$CellData = sheets_v4.Schema$CellData;
import Schema$Color = sheets_v4.Schema$Color;
import Schema$UpdateDimensionPropertiesRequest = sheets_v4.Schema$UpdateDimensionPropertiesRequest;

/**
 * Represents a spreadsheet complete with:
 * • Catalogs as rows (@see DscoCatalogRow)
 * • Columns with dsco data validation
 *
 * Can be turned into a GoogleSpreadsheet by using .intoGoogleSpreadsheet();
 */
export class DscoSpreadsheet implements Iterable<DscoColumn> {
    static readonly MODIFIED_COL_NAME = 'Needs Save?';
    static readonly MODIFIED_COL_DESC = "This column will be automatically checked on any rows with changes that haven't been saved to Dsco.";
    static readonly USER_SHEET_NAME = 'Catalog Data';
    static readonly USER_SHEET_ID: UserDataSheetId = 0;
    static readonly DATA_SHEET_NAME = 'ValidationData';
    static readonly DATA_SHEET_ID = 1;

    static generateUrl(spreadsheetId: string): string {
        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?rm=minimal`;
    }

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

    private rowData: DscoCatalogRow[] = [];

    * [Symbol.iterator](): IterableIterator<DscoColumn> {
        yield* this.columns.error;
        yield* this.columns.warn;
        yield* this.columns.info;
        yield* this.columns.none;
    }

    constructor(public spreadsheetName: string, private retailerId: number) {
        this.addColumn(
          new DscoColumn(DscoSpreadsheet.MODIFIED_COL_NAME, DscoSpreadsheet.MODIFIED_COL_DESC, 'transient', {
              format: 'boolean',
              required: PipelineErrorType.error
          }, {boolValue: false})
        );
    }

    addColumn(col: DscoColumn): void {
        this.columns[col.validation.required].push(col);
        this.columnsBySaveName[col.saveName] = col;
    }

    /**
     * Should be called before adding columns, as this ensures the image columns are added before the other columns
     */
    addCatalogRow(rowData: DscoCatalogRow): void {
        this.rowData.push(rowData);
    }

    /**
     * Builds the spreadsheet, preparing all data necessary to send to a google spreadsheet.
     */
    intoGoogleSpreadsheet(): {
        spreadsheet: GoogleSpreadsheet,
        dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[]
    } {
        const numRowsToBuild = Math.max(100, this.rowData.length + 50);

        // Creates an empty google spreadsheet.
        const spreadsheet = new GoogleSpreadsheet([
            {
                bandedRanges: this.generateBandedRanges(),
                data: [{rowData: [], rowMetadata: []}],
                properties: {
                    gridProperties: {rowCount: numRowsToBuild, frozenRowCount: 1},
                    title: DscoSpreadsheet.USER_SHEET_NAME,
                    sheetId: DscoSpreadsheet.USER_SHEET_ID
                }
            },
            {
                data: [{rowData: []}],
                properties: {
                    title: DscoSpreadsheet.DATA_SHEET_NAME,
                    sheetId: DscoSpreadsheet.DATA_SHEET_ID,
                    hidden: true
                },
                protectedRanges: [
                    {
                        description: 'Validation Data',
                        range: {sheetId: DscoSpreadsheet.DATA_SHEET_ID},
                        editors: {users: ['dsco.catalog.editor@dsco.io']}
                    }
                ]
            }
        ], [
            {
                metadataKey: COLUMN_SAVE_NAMES_SAVE_DATA_KEY,
                metadataValue: Array.from(this).map(col => col.saveName).join(','),
                visibility: 'DOCUMENT',
                location: {spreadsheet: true}
            }
        ], this.spreadsheetName);

        const dimensionUpdates = this.fillGoogleSpreadsheet(spreadsheet, numRowsToBuild);

        return {spreadsheet, dimensionUpdates};
    }

    /**
     * Fills the google spreadsheet with the catalog & column data from this DscoSpreadsheet
     */
    private fillGoogleSpreadsheet(sheet: GoogleSpreadsheet, numRowsToBuild: number): Schema$UpdateDimensionPropertiesRequest[] {
        const dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[] = [];

        // Set up the header row
        const userDataRows = sheet.userSheetRowData;
        const headerRow: Schema$CellData[] = [];
        userDataRows.push({values: headerRow});

        // Set up the data validation row
        const validationDataRows = sheet.validationSheetRowData;
        const validationRow: Schema$CellData[] = [];
        validationDataRows.push({values: validationRow});

        // Helper function that adds the enum values to the spreadsheet, returns the saved range.
        const addEnumVals = (vals: Array<string | number>) => {
            const rowNum = validationDataRows.push({
                values: vals.map(value => {
                    return {
                        userEnteredValue: {
                            stringValue: `${value}`
                        },
                        userEnteredFormat: {numberFormat: {type: 'TEXT'}}
                    };
                })
            });

            return `${DscoSpreadsheet.DATA_SHEET_NAME}!${rowNum}:${rowNum}`;
        };

        // Loops through every column, setting up the header row, validation row, and filling in the userData.
        let parsedColIdx = 0;
        for (const col of this) {
            resizeColumnIfNecessary(col, parsedColIdx, dimensionUpdates);

            headerRow.push(col.generateHeaderCell());
            validationRow.push(col.generateDataCell(undefined, this.retailerId, addEnumVals));

            // We start at 1 because the first userDataRow is the header row.
            for (let rowIdx = 1; rowIdx < numRowsToBuild; rowIdx++) {
                const rowData = this.rowData[rowIdx - 1];

                let row = userDataRows[rowIdx];
                if (!row) { // Happens on the first iteration only
                    row = userDataRows[rowIdx] = {
                        values: []
                    };

                    // Mark the modified rows in the sheet's metadata
                    sheet.setRowModifiedMetadata(rowIdx, rowData?.modified);
                }


                row.values!.push(col.generateDataCell(rowData, this.retailerId, addEnumVals));
            }


            parsedColIdx++;
        }

        return dimensionUpdates;
    }

    private generateBandedRanges(): Schema$BandedRange[] {
        const result: Schema$BandedRange[] = [];
        let bandedIdx = 0;

        for (const type of [PipelineErrorType.error, PipelineErrorType.warn, PipelineErrorType.info]) {
            const count = this.columns[type].length;
            if (count) {
                result.push({
                    range: {
                        sheetId: DscoSpreadsheet.USER_SHEET_ID,
                        startColumnIndex: bandedIdx,
                        endColumnIndex: bandedIdx + count,
                        startRowIndex: 0
                    },
                    rowProperties: {
                        headerColor: getColorForRequired(type),
                        firstBandColor: {red: 1, green: 1, blue: 1},
                        secondBandColor: getColorForRequired(type, true)
                    }
                });

                bandedIdx += count;
            }
        }

        return result;
    }
}

function getColorForRequired(status: PipelineErrorType, light = false): Schema$Color {
    switch (status) {
        case PipelineErrorType.error:
            return {
                red: light ? 0.9281132075 : 0.5529412,
                green: light ? 1 : 0.7764706,
                blue: light ? 0.9013207547 : 0.24705882
            };
        case PipelineErrorType.warn:
            return {
                red: light ? 0.9130188679 : 0.47058824,
                green: light ? 0.9696226415 : 0.78039217,
                blue: light ? 1 : 0.9254902
            };
        case PipelineErrorType.info:
            return {
                red: light ? 0.97 : 0.8784314,
                green: light ? 0.97 : 0.8784314,
                blue: light ? 0.97 : 0.8784314
            };
    }
}

function resizeColumnIfNecessary(col: DscoColumn, parsedColIdx: number, dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[]): void {
    const width = col.colWidth();
    if (width > DscoColumn.DEFAULT_COLUMN_WIDTH) {
        const prev = dimensionUpdates[dimensionUpdates.length - 1];

        if (prev && prev.range!.endIndex === parsedColIdx) {
            prev.range!.endIndex++;
        } else {
            dimensionUpdates.push({
                range: {
                    startIndex: parsedColIdx,
                    endIndex: parsedColIdx + 1,
                    dimension: 'COLUMNS',
                    sheetId: DscoSpreadsheet.USER_SHEET_ID
                },
                fields: 'pixelSize',
                properties: {
                    pixelSize: width
                }
            });
        }
    }
}
