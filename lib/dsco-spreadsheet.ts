import { XrayActionSeverity } from '@dsco/ts-models';
import { drive_v3, sheets_v4 } from 'googleapis';
import { DscoColumn } from './dsco-column';
import Drive = drive_v3.Drive;
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$CellData = sheets_v4.Schema$CellData;
import Schema$Color = sheets_v4.Schema$Color;
import Schema$DataValidationRule = sheets_v4.Schema$DataValidationRule;
import Schema$RowData = sheets_v4.Schema$RowData;
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;
import Schema$UpdateDimensionPropertiesRequest = sheets_v4.Schema$UpdateDimensionPropertiesRequest;
import Sheets = sheets_v4.Sheets;

const dropdownSheetName = 'PickListData';

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
    private headerRow: Schema$CellData[] = [];
    private dataRow: Schema$CellData[] = [];
    private pickListRows: Schema$RowData[] = [];

    constructor(public spreadsheetName: string) {
    }

    addColumn(col: DscoColumn): void {
        this.columns[col.validation.required].push(col);
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
            let validation: Schema$DataValidationRule;

            if (hasMin || hasMax) {
                validation = {
                    condition: {
                        type: hasMin && hasMax ? 'NUMBER_BETWEEN' : (hasMin ? 'NUMBER_GREATER_THAN_EQ' : 'NUMBER_LESS_THAN_EQ'),
                        values: [min, max].filter((it): it is number => it !== undefined).map(num => ({
                            userEnteredValue: num.toString(10)
                        }))
                    },
                    strict: true,
                    showCustomUi: true,
                    inputMessage: hasMax && hasMin ?
                      `${col.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'} between ${min} and ${max}` :
                (hasMin ? `${col.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'} no less than ${min}` :
                  `${col.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'} no greater than ${max}`)
                };
            } else {
                validation = {
                    condition: {
                        type: 'CUSTOM_FORMULA',
                        values: [{userEnteredValue: '=ISNUMBER(INDIRECT("RC", false))'}]
                    },
                    strict: true,
                    inputMessage: `${col.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'}`
                };
            }

            this.dataRow.push({
                userEnteredFormat: {numberFormat: {pattern: format === 'integer' ? '#,##0' : '#,##0.00', type: 'NUMBER'}},
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
        } else if (format === 'date' || format === 'date-time') {
            this.dataRow.push({
                dataValidation: {
                    condition: {
                        type: dateInFuture ? 'DATE_AFTER' : 'DATE_IS_VALID',
                        values: dateInFuture ? [{userEnteredValue: '=TODAY()'}] : undefined
                    },
                    strict: true,
                    showCustomUi: true,
                    inputMessage: dateInFuture ? `${col.name} must be a future date.` : `${col.name} must be a valid ${format === 'date' ? 'date' : 'date & time'}.`
                },
                userEnteredFormat: {numberFormat: {type: format === 'date' ? 'DATE' : 'DATE_TIME'}}
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
                values: Array.from(enumVals || []).map(value => {
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
        } else if (format === 'uri' || format === 'email') {
            this.dataRow.push({
                dataValidation: {
                    condition: {type: format === 'email' ? 'TEXT_IS_EMAIL' : 'TEXT_IS_URL'},
                    strict: true,
                    showCustomUi: true,
                    inputMessage: `${col.name} must be ${format === 'email' ? 'an email' : 'a URL'}.`
                }
            });
        } else { // TODO: Validate array: =AND(ARRAYFORMULA(ISNUMBER(SPLIT(G5, ",", TRUE, TRUE))))
            this.dataRow.push({});
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
