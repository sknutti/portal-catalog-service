import { XrayActionSeverity } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { SPREADSHEET_SAVE_DATA_KEY, SpreadsheetSaveData } from '@lib/spreadsheet-save-data';
import { drive_v3, sheets_v4 } from 'googleapis';
import { DscoColumn } from './dsco-column';
import Drive = drive_v3.Drive;
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$CellData = sheets_v4.Schema$CellData;
import Schema$Color = sheets_v4.Schema$Color;
import Schema$RowData = sheets_v4.Schema$RowData;
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;
import Schema$UpdateDimensionPropertiesRequest = sheets_v4.Schema$UpdateDimensionPropertiesRequest;
import Sheets = sheets_v4.Sheets;

const validationSheetName = 'ValidationData';

export class DscoSpreadsheet implements Iterable<DscoColumn> {
    static readonly PUBLISHED_COL_NAME = 'Published to Dsco';

    static generateUrl(spreadsheetId: string): string {
        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?rm=minimal`;
    }

    columns: Record<XrayActionSeverity | 'none', DscoColumn[]> = {
        [XrayActionSeverity.error]: [
            new DscoColumn(DscoSpreadsheet.PUBLISHED_COL_NAME, 'transient', {
                format: 'boolean',
                required: XrayActionSeverity.error
            })
        ],
        [XrayActionSeverity.warn]: [],
        [XrayActionSeverity.info]: [],
        none: []
    };

    // These updates are sent after the spreadsheet is created to resize the sheet.
    private dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[] = [];

    private userDataRows: Schema$RowData[] = [
        {values: []} // The header row
    ];
    private headerRow: Schema$CellData[] = this.userDataRows[0].values!;


    private validationDataRows: Schema$RowData[] = [
        {values: []} // The validation row
    ];
    private validationRow: Schema$CellData[] = this.validationDataRows[0].values!;

    private rowData: DscoCatalogRow[] = [];

    * [Symbol.iterator](): IterableIterator<DscoColumn> {
        yield* this.columns.error;
        yield* this.columns.warn;
        yield* this.columns.info;
        yield* this.columns.none;
    }

    private developerSaveData: SpreadsheetSaveData = {
        modifiedRows: {},
        colData: []
    }

    constructor(public spreadsheetName: string, private retailerId: number) {
    }

    addColumn(col: DscoColumn): void {
        this.columns[col.validation.required].push(col);
    }

    /**
     * Should be called before adding columns, as this ensures the image columns are added before the other columns
     */
    addCatalogRow(rowData: DscoCatalogRow): void {
        this.rowData.push(rowData);
    }

    /**
     * Creates the spreadsheet, returning the spreadsheet id.
     */
    async createSpreadsheet(sheets: Sheets, drive: Drive): Promise<string> {
        const response = await sheets.spreadsheets.create({
            requestBody: this.build()
        });

        const fileId = response.data.spreadsheetId!;

        const bandedRanges = this.generateBandedRanges();

        // For some annoying reason banding and dimensions need to be done after the fact.
        if (bandedRanges.length || this.dimensionUpdates.length) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: fileId,
                requestBody: {
                    includeSpreadsheetInResponse: false,
                    responseIncludeGridData: false,
                    requests: [
                        ...bandedRanges.map(bandedRange => ({addBanding: {bandedRange}})),
                        ...this.dimensionUpdates.map(dimension => ({updateDimensionProperties: dimension}))
                    ]
                }
            });
        }

        await drive.permissions.create({
            fileId,
            requestBody: {
                role: 'writer',
                type: 'anyone'
            }
        });

        return fileId;
    }

    /**
     * Builds the spreadsheet, preparing it to send
     */
    private build(): Schema$Spreadsheet {
        const numRowsToBuild = Math.max(100, this.rowData.length + 50);

        let parsedColIdx = 0;
        for (const col of this) {
            this.parseCol(col, numRowsToBuild, parsedColIdx);
            parsedColIdx++;
        }

        return {
            sheets: [
                {
                    data: [{rowData: this.userDataRows}],
                    properties: {
                        gridProperties: {
                            rowCount: numRowsToBuild,
                            frozenRowCount: 1
                        },
                        title: 'Catalog Data',
                        sheetId: 0
                    },
                    protectedRanges: [
                        {
                            description: 'Published Column',
                            range: {
                                sheetId: 0,
                                startColumnIndex: 0,
                                endColumnIndex: 1
                            },
                            warningOnly: true
                        }
                    ]
                },
                {
                    data: [{rowData: this.validationDataRows}],
                    properties: {
                        title: validationSheetName,
                        sheetId: 1,
                        hidden: true
                    },
                    protectedRanges: [
                        {
                            description: 'Validation Data',
                            range: {
                                sheetId: 1
                            },
                            editors: {
                                users: ['dsco.catalog.editor@dsco.io']
                            }
                        }
                    ]
                }
            ],
            properties: {
                title: this.spreadsheetName,
            },
            developerMetadata: [
                {
                    metadataKey: SPREADSHEET_SAVE_DATA_KEY,
                    metadataValue: JSON.stringify(this.developerSaveData)
                }
            ]
        };
    }

    private parseCol(col: DscoColumn, numRowsToBuild: number, parsedColIdx: number): void {
        this.developerSaveData.colData.push({
            name: col.name,
            fieldName: col.name !== col.fieldName ? col.fieldName : undefined,
            type: col.type
        });

        this.resizeColumnIfNecessary(col, parsedColIdx);

        // Adds the enum values to the spreadsheet, returns the saved range.
        const addEnumVals = (vals: Array<string | number>) => {
            const rowNum = this.validationDataRows.push({
                values: vals.map(value => {
                    return {
                        userEnteredValue: {
                            stringValue: `${value}`
                        },
                        userEnteredFormat: {numberFormat: {type: 'TEXT'}}
                    };
                })
            });

            return `${validationSheetName}!${rowNum}:${rowNum}`;
        };

        this.headerRow.push(col.generateHeaderCell());
        this.validationRow.push(col.generateDataCell(undefined, this.retailerId, addEnumVals));

        // We start at 1 because the first userDataRow is the header row.
        for (let i = 1; i < numRowsToBuild; i++) {
            let row = this.userDataRows[i];
            if (!row) {
                row = this.userDataRows[i] = {
                    values: []
                };
            }

            row.values!.push(col.generateDataCell(this.rowData[i - 1], this.retailerId, addEnumVals));
        }
    }

    private resizeColumnIfNecessary(col: DscoColumn, parsedColIdx: number): void {
        const width = col.colWidth();
        if (width > DscoColumn.DEFAULT_COLUMN_WIDTH) {
            const prev = this.dimensionUpdates[this.dimensionUpdates.length - 1];

            if (prev && prev.range!.endIndex === parsedColIdx) {
                prev.range!.endIndex++;
            } else {
                this.dimensionUpdates.push({
                    range: {
                        startIndex: parsedColIdx,
                        endIndex: parsedColIdx + 1,
                        dimension: 'COLUMNS',
                        sheetId: 0
                    },
                    fields: 'pixelSize',
                    properties: {
                        pixelSize: width
                    }
                });
            }
        }
    }

    private generateBandedRanges(): Schema$BandedRange[] {
        const result: Schema$BandedRange[] = [];
        let bandedIdx = 0;

        for (const type of [XrayActionSeverity.error, XrayActionSeverity.warn, XrayActionSeverity.info]) {
            const count = this.columns[type].length;
            if (count) {
                result.push({
                    range: {
                        sheetId: 0,
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

export interface DscoCatalogRow {
    catalog: CoreCatalog;
    published: boolean;
}
