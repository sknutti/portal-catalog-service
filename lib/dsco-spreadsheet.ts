import { XrayActionSeverity } from '@dsco/ts-models';
import { DscoCatalogRow } from '@lib/dsco-catalog-row';
import { GoogleSpreadsheet } from '@lib/google-spreadsheet';
import { SPREADSHEET_SAVE_DATA_KEY, SpreadsheetSaveData } from '@lib/spreadsheet-save-data';
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
    static readonly PUBLISHED_COL_NAME = 'Published to Dsco';
    static readonly USER_SHEET_NAME = 'Catalog Data';
    static readonly USER_SHEET_ID = 0;
    static readonly DATA_SHEET_NAME = 'ValidationData';
    static readonly DATA_SHEET_ID = 1;

    static generateUrl(spreadsheetId: string): string {
        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?rm=minimal`;
    }

    columns: Record<XrayActionSeverity | 'none', DscoColumn[]> = {
        [XrayActionSeverity.error]: [],
        [XrayActionSeverity.warn]: [],
        [XrayActionSeverity.info]: [],
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
          new DscoColumn(DscoSpreadsheet.PUBLISHED_COL_NAME, 'transient', {
              format: 'boolean',
              required: XrayActionSeverity.error
          })
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
                data: [{rowData: []}],
                properties: {
                    gridProperties: {rowCount: numRowsToBuild, frozenRowCount: 1},
                    title: DscoSpreadsheet.USER_SHEET_NAME,
                    sheetId: DscoSpreadsheet.USER_SHEET_ID
                },
                protectedRanges: [
                    {
                        description: 'Published Column',
                        range: {sheetId: DscoSpreadsheet.USER_SHEET_ID, startColumnIndex: 0, endColumnIndex: 1},
                        warningOnly: true
                    }
                ]
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
                metadataKey: SPREADSHEET_SAVE_DATA_KEY,
                metadataValue: '',
                visibility: 'DOCUMENT',
                location: {spreadsheet: true}
            }
        ]);

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

        const developerSaveData: SpreadsheetSaveData = {
            modifiedRows: {},
            colSaveNames: []
        };

        // Loops through every column, setting up the header row, validation row, and filling in the userData.
        let parsedColIdx = 0;
        for (const col of this) {
            developerSaveData.colSaveNames.push(col.saveName);

            resizeColumnIfNecessary(col, parsedColIdx, dimensionUpdates);

            headerRow.push(col.generateHeaderCell());
            validationRow.push(col.generateDataCell(undefined, this.retailerId, addEnumVals));

            // We start at 1 because the first userDataRow is the header row.
            for (let i = 1; i < numRowsToBuild; i++) {
                let row = userDataRows[i];
                if (!row) {
                    row = userDataRows[i] = {
                        values: []
                    };
                }

                row.values!.push(col.generateDataCell(this.rowData[i - 1], this.retailerId, addEnumVals));
            }


            parsedColIdx++;
        }

        sheet.saveDataDeveloperMetadata.metadataValue = JSON.stringify(developerSaveData);

        return dimensionUpdates;
    }

    private generateBandedRanges(): Schema$BandedRange[] {
        const result: Schema$BandedRange[] = [];
        let bandedIdx = 0;

        for (const type of [XrayActionSeverity.error, XrayActionSeverity.warn, XrayActionSeverity.info]) {
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

function getColorForRequired(status: XrayActionSeverity, light = false): Schema$Color {
    switch (status) {
        case XrayActionSeverity.error:
            return {
                red: light ? 0.9281132075 : 0.5529412,
                green: light ? 1 : 0.7764706,
                blue: light ? 0.9013207547 : 0.24705882
            };
        case XrayActionSeverity.warn:
            return {
                red: light ? 0.9130188679 : 0.47058824,
                green: light ? 0.9696226415 : 0.78039217,
                blue: light ? 1 : 0.9254902
            };
        case XrayActionSeverity.info:
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
