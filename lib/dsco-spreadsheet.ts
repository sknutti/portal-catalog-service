import { XrayActionSeverity } from '@dsco/ts-models';
import { drive_v3, sheets_v4 } from 'googleapis';
import { DscoColumn } from './dsco-column';
import { prepareValueForSpreadsheet } from './google-api-utils';
import Drive = drive_v3.Drive;
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$CellData = sheets_v4.Schema$CellData;
import Schema$Color = sheets_v4.Schema$Color;
import Schema$DataValidationRule = sheets_v4.Schema$DataValidationRule;
import Schema$RowData = sheets_v4.Schema$RowData;
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;
import Schema$UpdateDimensionPropertiesRequest = sheets_v4.Schema$UpdateDimensionPropertiesRequest;
import Sheets = sheets_v4.Sheets;

const validationSheetName = 'ValidationData';

export class DscoSpreadsheet {
    static generateUrl(spreadsheetId: string): string {
        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?rm=minimal`;
    }

    columns: Record<XrayActionSeverity | 'none', DscoColumn[]> = {
        [XrayActionSeverity.error]: [],
        [XrayActionSeverity.warn]: [],
        [XrayActionSeverity.info]: [],
        none: []
    };

    private parsedColIdx = 0;
    // These updates are sent after the spreadsheet is created to resize the sheet.
    private dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[] = [];

    private userDataRows: Schema$RowData[] = [
        {values: []} // The header row
    ]
    private headerRow: Schema$CellData[] = this.userDataRows[0].values!;


    private validationDataRows: Schema$RowData[] = [
        {values: []} // The validation row
    ];
    private validationRow: Schema$CellData[] = this.validationDataRows[0].values!;

    private rowData: Record<string, string>[] = [];

    constructor(public spreadsheetName: string) {
    }

    addColumn(col: DscoColumn): void {
        this.columns[col.validation.required].push(col);
    }

    /**
     * Should be a map from column name to cell value.
     */
    addRowData(row: Record<string, string>): void {
        this.rowData.push(row);
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
                        ...this.dimensionUpdates.map(dimension => ({updateDimensionProperties: dimension})),
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
        this.parsedColIdx = 0;

        const numRowsToBuild = Math.max(100, this.rowData.length + 50);

        for (const col of this.columns.error) {
            this.parseCol(col, numRowsToBuild);
        }
        for (const col of this.columns.warn) {
            this.parseCol(col, numRowsToBuild);
        }
        for (const col of this.columns.info) {
            this.parseCol(col, numRowsToBuild);
        }
        for (const col of this.columns.none) {
            this.parseCol(col, numRowsToBuild);
        }

        return {
            sheets: [
                {
                    data: [{rowData: this.userDataRows}],
                    properties: {
                        gridProperties: {rowCount: numRowsToBuild},
                        title: 'Catalog Data',
                        sheetId: 0
                    }
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
                title: this.spreadsheetName
            }
        };
    }

    private parseCol(col: DscoColumn, numRowsToBuild: number): void {
        this.resizeColumnIfNecessary(col);

        // Adds the enum values to the spreadsheet, returns the saved range.
        const addEnumVals = (vals: Array<string | number>) => {
            const rowNum = this.validationDataRows.push({
                values: vals.map(value => {
                    return {
                        userEnteredValue: {
                            stringValue: prepareValueForSpreadsheet(`${value}`)
                        }
                    };
                })
            });

            return `${validationSheetName}!${rowNum}:${rowNum}`;
        };

        this.headerRow.push(col.generateHeaderCell());
        this.validationRow.push(col.generateDataCell('', addEnumVals));

        // We start at 1 because the first userDataRow is the header row.
        for (let i = 1; i < numRowsToBuild; i++) {
            let row = this.userDataRows[i];
            if (!row) {
                row = this.userDataRows[i] = {
                    values: []
                };
            }

            const value = this.rowData[i - 1]?.[col.name] || '';
            row.values!.push(col.generateDataCell(value, addEnumVals));
        }

        this.parsedColIdx++;
    }

    private resizeColumnIfNecessary(col: DscoColumn): void {
        const width = col.colWidth();
        if (width > DscoColumn.DEFAULT_COLUMN_WIDTH) {
            const prev = this.dimensionUpdates[this.dimensionUpdates.length - 1];

            if (prev && prev.range!.endIndex === this.parsedColIdx) {
                prev.range!.endIndex++;
            } else {
                this.dimensionUpdates.push({
                    range: {
                        startIndex: this.parsedColIdx,
                        endIndex: this.parsedColIdx + 1,
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
