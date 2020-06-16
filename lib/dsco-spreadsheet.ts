import { AttributeRequiredType, XrayActionSeverity } from '@dsco/ts-models';
import { drive_v3, sheets_v4 } from 'googleapis';
import Drive = drive_v3.Drive;
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$CellData = sheets_v4.Schema$CellData;
import Schema$Color = sheets_v4.Schema$Color;
import Schema$RowData = sheets_v4.Schema$RowData;
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;
import Schema$UpdateDimensionPropertiesRequest = sheets_v4.Schema$UpdateDimensionPropertiesRequest;
import Sheets = sheets_v4.Sheets;
import Schema$DataValidationRule = sheets_v4.Schema$DataValidationRule;

const DEFAULT_COLUMN_WIDTH = 100;
const dropdownSheetName = 'PickListData';

export class DscoSpreadsheet {
    columns: Record<XrayActionSeverity | 'none', DscoColumn[]> = {
        [XrayActionSeverity.error]: [],
        [XrayActionSeverity.warn]: [],
        [XrayActionSeverity.info]: [],
        none: []
    };

    private parsedColIdx = 0;
    // These updates are sent after the spreadsheet is created to resize the sheet.
    private dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[] = [];
    private headerRow: Schema$CellData[] = [];
    private dataRow: Schema$CellData[] = [];
    private pickListRows: Schema$RowData[] = [];

    constructor(public spreadsheetName: string) {
    }

    addColumn(col: DscoColumn): void {
        this.columns[col.validation.required].push(col);
    }

    /**
     * Creates the spreadsheet, returning the link to the sheet.
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

        return `https://docs.google.com/spreadsheets/d/${fileId}/edit?rm=minimal`;
    }

    /**
     * Builds the spreadsheet, preparing it to send
     */
    private build(numRows = 100): Schema$Spreadsheet {
        this.parsedColIdx = 0;
        for (const col of this.columns.error) {
            this.parseCol(col);
        }
        for (const col of this.columns.warn) {
            this.parseCol(col);
        }
        for (const col of this.columns.info) {
            this.parseCol(col);
        }
        for (const col of this.columns.none) {
            this.parseCol(col);
        }

        const rowData: Schema$RowData[] = [{values: this.headerRow}];

        for (let i = 0; i < (numRows - 1); i++) {
            rowData.push({values: this.dataRow});
        }

        return {
            sheets: [
                {
                    data: [{rowData}],
                    properties: {
                        gridProperties: {rowCount: numRows},
                        title: 'Catalog Data',
                        sheetId: 0
                    }
                },
                {
                    data: [{rowData: this.pickListRows}],
                    properties: {
                        title: dropdownSheetName,
                        sheetId: 1,
                        hidden: true
                    },
                    protectedRanges: [
                        {
                            description: 'Pick List Data',
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

    private parseCol(col: DscoColumn): void {
        this.resizeColumnIfNecessary(col);

        this.headerRow.push({
            userEnteredValue: {stringValue: col.name.replace(/^([+=])/, '\'$1')},
            userEnteredFormat: {
                textFormat: {
                    fontFamily: 'Arial',
                    bold: true
                }
            }
        });

        const {format, min, max, dontMatch, match, regexMessage, minLength, maxLength, arrayType, enumVals, dateInFuture} = col.validation;
        if (format === 'integer' || format === 'number') {
            const hasMin = min !== undefined;
            const hasMax = max !== undefined;
            let validation: Schema$DataValidationRule | undefined;

            if (hasMin || hasMax) {
                validation = {
                    condition: {
                        type: hasMin && hasMax ? 'NUMBER_BETWEEN' : (hasMin ? 'NUMBER_GREATER_THAN_EQ' : 'NUMBER_LESS_THAN_EQ'),
                        values: [min, max].filter((it): it is number => it !== undefined).map(num => ({
                            userEnteredValue: num.toString(10)
                        }))
                    }
                };
            }

            this.dataRow.push({
                userEnteredFormat: {numberFormat: {pattern: '#,##0', type: 'NUMBER'}},
                dataValidation: validation
            });
        } else if (format === 'string') {
            const validations: string[] = [];
            if (match) {
                validations.push(`REGEXMATCH(TO_TEXT(INDIRECT("RC", false)), "${match}")`);
            }
            if (dontMatch) {
                for (const regex of dontMatch) {
                    validations.push(`NOT(REGEXMATCH(TO_TEXT(INDIRECT("RC", false)), "${regex}"))`);
                }
            }

            this.dataRow.push({
                userEnteredFormat: {numberFormat: {type: 'TEXT'}},
                dataValidation: validations.length ? {
                    condition: {
                        type: 'CUSTOM_FORMULA',
                        values: [{userEnteredValue: `=AND(${validations.join(',')})`}]
                    },
                    strict: false,
                    inputMessage:  regexMessage
                } : undefined
            });
        } else if (format === 'date-time') {
            this.dataRow.push({userEnteredFormat: {numberFormat: {type: 'DATE_TIME'}}});
        } else if (format === 'date') {
            console.error('IN FUTURE', dateInFuture);

            this.dataRow.push({
                dataValidation: {
                    condition: {
                        type: dateInFuture ? 'DATE_AFTER' : 'DATE_IS_VALID',
                        values: dateInFuture ? [{relativeDate: new Date().toISOString()}] : undefined
                    },
                    strict: true,
                    showCustomUi: true
                },
                userEnteredFormat: {numberFormat: {type: 'DATE'}}
            });
        } else if (format === 'time') {
            this.dataRow.push({userEnteredFormat: {numberFormat: {type: 'TIME'}}});
        } else if (format === 'boolean') {
            this.dataRow.push({
                dataValidation: {
                    condition: {type: 'BOOLEAN'},
                    showCustomUi: true,
                    strict: true
                }
            });
        } else if (format === 'enum') {
            this.pickListRows.push({
                values: enumVals?.map(value => {
                    return {
                        userEnteredValue: {
                            stringValue: `${value}`.replace(/^([+=])/, '\'$1')
                        }
                    };
                })
            });

            const rowNum = this.pickListRows.length;
            this.dataRow.push({
                dataValidation: {
                    condition: {
                        type: 'ONE_OF_RANGE',
                        values: [{userEnteredValue: `=${dropdownSheetName}!${rowNum}:${rowNum}`}]
                    },
                    strict: true,
                    showCustomUi: true
                }
            });
        } else { // TODO: Validate array: =AND(ARRAYFORMULA(ISNUMBER(SPLIT(G5, ",", TRUE, TRUE))))
            this.dataRow.push({});
        }

        this.parsedColIdx++;
    }

    private resizeColumnIfNecessary(col: DscoColumn): void {
        const width = col.colWidth();
        if (width > DEFAULT_COLUMN_WIDTH) {
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

export class DscoColumn {
    validation: DscoColValidation = {
        required: 'none'
    };

    constructor(
      public name: string,
    ) {
    }

    private guessPixelSize(): number {
        let total = 0;
        for (const char of this.name) {
            if (char === char.toUpperCase()) {
                total += 10;
            } else {
                total += 8;
            }
        }
        return total;
    }

    public colWidth(): number {
        return this.guessPixelSize() > DEFAULT_COLUMN_WIDTH ? 160 : DEFAULT_COLUMN_WIDTH;
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

export interface DscoColValidation {
    format?: 'string' | 'integer' | 'date-time' | 'date' | 'time' | 'number' | 'boolean' | 'array' | 'enum';
    enumVals?: Array<string | number>;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    match?: string; // regex
    dontMatch?: string[]; // regex
    regexMessage?: string;
    required: XrayActionSeverity | 'none';
    arrayType?: 'string' | 'integer' | 'number';
    dateInFuture?: boolean;
}
