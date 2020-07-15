import { XrayActionSeverity } from '@dsco/ts-models';
import { DscoCatalogRow } from '@lib/dsco-catalog-row';
import { DscoSpreadsheet } from '@lib/dsco-spreadsheet';
import { prepareValueForSpreadsheet, SerialDate } from '@lib/google-api-utils';
import { sheets_v4 } from 'googleapis';
import Schema$CellData = sheets_v4.Schema$CellData;
import Schema$CellFormat = sheets_v4.Schema$CellFormat;
import Schema$DataValidationRule = sheets_v4.Schema$DataValidationRule;
import Schema$ExtendedValue = sheets_v4.Schema$ExtendedValue;

/**
 * Represents a single column in the spreadsheet.
 * Contains validation information, and can be used to extract data from catalog
 */
export class DscoColumn {
    static readonly DEFAULT_COLUMN_WIDTH = 100;

    /**
     * The colon and space here are intentionally breaking the extended attributes requirements for field names.
     * This ensures name collisions can't happen.
     */
    static readonly DSCO_PREFIX = 'Dsco: ';

    private dataValidation?: Schema$DataValidationRule;
    private format?: Schema$CellFormat;
    private generatedValidationYet = false;


    get name(): string {
        return this.shouldHaveDscoPrefix ? DscoColumn.DSCO_PREFIX + this.fieldName : this.fieldName;
    }

    /**
     * Saved as metadata in the google spreadsheet.
     * Used to associate data in the google spreadsheet with a DscoColumn.
     */
    get saveName(): string {
        return `${this.type}@${this.fieldName}`;
    }

    /**
     If there are both core and extended rules for the same name, this should be set to true.
     The name will have the Dsco: prefix added.
    */
    shouldHaveDscoPrefix = false;

    constructor(
      public fieldName: string,
      public type: 'core' | 'extended' | 'transient', // Transient cols aren't directly mapped to dsco attributes.
      public validation: DscoColValidation = {
          required: 'none'
      }
    ) {
    }

    generateHeaderCell(): Schema$CellData {
        return {
            userEnteredValue: {stringValue: prepareValueForSpreadsheet(this.name)},
            userEnteredFormat: {
                textFormat: {
                    fontFamily: 'Arial',
                    bold: true
                }
            },
            dataValidation: {
                condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{userEnteredValue: `=EQ(INDIRECT("RC", false), "${this.name}")`}]
                },
                strict: true,
                inputMessage: `Must equal ${this.name}`
            }
        };
    }

    /**
     * Generates a data cell for the spreadsheet with the given value, as well as the correct validation
     * @param rowData
     * @param retailerId
     * @param addEnumVals A callback telling the spreadsheet to add these enum values to the spreadsheet.  It returns the range that holds the enum values.
     */
    generateDataCell(rowData: DscoCatalogRow | undefined, retailerId: number, addEnumVals: (vals: Array<string | number>) => string): Schema$CellData {
        this.generateValidationData(addEnumVals);

        return {
            userEnteredValue: rowData ? this.makeExtendedValue(rowData, retailerId) : undefined,
            dataValidation: this.dataValidation,
            userEnteredFormat: this.format
        };
    }

    /**
     * Reads the value from the given cell, storing it in the correct place in the rowData.
     *
     * Assumes extended_attributes[retailerId] exists
     */
    readDataFromExistingCell(cell: Schema$CellData, rowData: DscoCatalogRow, retailerId: number): void {
        // We ignore the published col and pull that from the AppScriptSaveData
        if (this.name === DscoSpreadsheet.PUBLISHED_COL_NAME) {
            return;
        }

        const valueToSet = this.getDataFromExtendedValue(cell.effectiveValue);
        if (valueToSet === undefined || valueToSet === null) {
            return;
        }

        if (this.type === 'core') {
            rowData.catalog[this.fieldName] = valueToSet;
        } else if (this.type === 'extended') {
            rowData.catalog.extended_attributes![retailerId]![this.fieldName] = valueToSet;
        }
    }

    /**
     * Extracts the value from the DscoCatalogRow, returning a google spreadsheet ExtendedValue
     */
    private makeExtendedValue(rowData: DscoCatalogRow, retailerId: number): Schema$ExtendedValue | undefined {
        let data: any;
        if (this.type === 'core') {
            data = rowData.catalog[this.fieldName];
        } else if (this.type === 'extended') {
            data = rowData.catalog.extended_attributes?.[retailerId]?.[this.fieldName];
        } else if (this.name === DscoSpreadsheet.PUBLISHED_COL_NAME) {
            data = rowData.published;
        }

        if (data === null || data === undefined) {
            return undefined;
        }

        switch (this.validation.format) {
            case 'date':
            case 'date-time':
                return {numberValue: SerialDate.fromJSDate(data instanceof Date ? data : new Date(data))};
            case 'time':
                return {numberValue: SerialDate.fromTime(data)};
            case 'array':
                return {stringValue: (data || []).join(', ')};
            case 'boolean':
                return {boolValue: !!data};
            case 'integer':
            case 'number':
                return {numberValue: +data};
            case 'string':
            case 'uri':
            case 'email':
            case 'enum':
                return {stringValue: `${data}`};
            case undefined:
                return undefined;
        }
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
        return this.guessPixelSize() > DscoColumn.DEFAULT_COLUMN_WIDTH ? 160 : DscoColumn.DEFAULT_COLUMN_WIDTH;
    }

    /**
     * Generates the validation and formatting data for this column
     *
     * @param addEnumVals A callback telling the spreadsheet to add these enum values to the spreadsheet.  It returns the range that holds the enum values.
     */
    private generateValidationData(addEnumVals: (vals: Array<string | number>) => string): void {
        if (this.generatedValidationYet) {
            return;
        }

        this.generatedValidationYet = true;

        const {format, min, max, dontMatch, match, regexMessage, minLength, maxLength, arrayType, enumVals, dateInFuture} = this.validation;
        if (format === 'integer' || format === 'number') {
            const hasMin = min !== undefined;
            const hasMax = max !== undefined;

            if (hasMin || hasMax) {
                this.dataValidation = {
                    condition: {
                        type: hasMin && hasMax ? 'NUMBER_BETWEEN' : (hasMin ? 'NUMBER_GREATER_THAN_EQ' : 'NUMBER_LESS_THAN_EQ'),
                        values: [min, max].filter((it): it is number => it !== undefined).map(num => ({
                            userEnteredValue: num.toString(10)
                        }))
                    },
                    showCustomUi: true,
                    strict: true,
                    inputMessage: hasMax && hasMin ?
                      `${this.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'} between ${min} and ${max}` :
                      (hasMin ? `${this.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'} no less than ${min}` :
                        `${this.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'} no greater than ${max}`)
                };
            } else {
                this.dataValidation = {
                    condition: {
                        type: 'CUSTOM_FORMULA',
                        values: [{userEnteredValue: '=ISNUMBER(INDIRECT("RC", false))'}]
                    },
                    strict: true,
                    inputMessage: `${this.name} must be a number ${format === 'integer' ? '(no decimal)' : '(decimals allowed)'}`
                };
            }

            this.format = {numberFormat: {pattern: format === 'integer' ? '#,##0' : '#,##0.00', type: 'NUMBER'}};

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

            this.format = {numberFormat: {type: 'TEXT'}};
            this.dataValidation = validations.length ? {
                condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{userEnteredValue: `=AND(${validations.join(',')})`}]
                },
                strict: true,
                inputMessage: regexMessage
            } : undefined;
        } else if (format === 'date' || format === 'date-time') {
            this.dataValidation = {
                condition: {
                    type: dateInFuture ? 'DATE_AFTER' : 'DATE_IS_VALID',
                    values: dateInFuture ? [{userEnteredValue: '=TODAY()'}] : undefined
                },
                showCustomUi: true,
                strict: true,
                inputMessage: dateInFuture ? `${this.name} must be a future date.` : `${this.name} must be a valid ${format === 'date' ? 'date' : 'date & time'}.`
            };
            this.format = {numberFormat: {type: format === 'date' ? 'DATE' : 'DATE_TIME'}};
        } else if (format === 'time') {
            this.format = {numberFormat: {type: 'TIME', pattern: 'h":"mm" "am/pm'}};
        } else if (format === 'boolean') {
            this.dataValidation = {
                condition: {type: 'BOOLEAN'},
                showCustomUi: true,
                strict: true
            };
        } else if (format === 'enum') {
            const range = addEnumVals(Array.from(enumVals || []));


            this.format = {numberFormat: {type: 'TEXT'}};
            this.dataValidation = {
                condition: {
                    type: 'ONE_OF_RANGE',
                    values: [{userEnteredValue: `=${range}`}]
                },
                showCustomUi: true,
                strict: true,
                inputMessage: `${this.name} must be one of the allowed values.`
            };
        } else if (format === 'uri' || format === 'email') {
            this.format = {numberFormat: {type: 'TEXT'}};
            this.dataValidation = {
                condition: {type: format === 'email' ? 'TEXT_IS_EMAIL' : 'TEXT_IS_URL'},
                showCustomUi: true,
                strict: true,
                inputMessage: `${this.name} must be ${format === 'email' ? 'an email' : 'a URL'}.`
            };
        }

        // TODO: Validate array: =AND(ARRAYFORMULA(ISNUMBER(SPLIT(G5, ",", TRUE, TRUE))))
    }

    private getDataFromExtendedValue(cellValue: Schema$ExtendedValue | undefined): any {
        if (!cellValue) {
            return;
        }

        switch (this.validation.format) {
            case 'string':
            case 'enum':
            case 'email':
            case 'uri':
            case 'time': // TODO: What format does time expect?
                return cellValue.stringValue ?? cellValue.numberValue?.toString() ?? cellValue.boolValue?.toString();
            case 'number':
            case 'integer':
                return cellValue.numberValue ?? +(cellValue.stringValue || '0');
            case 'boolean':
                return cellValue.boolValue ?? (cellValue.numberValue === 1 || cellValue.stringValue?.toLowerCase() === 'true');
            case 'array':
                const num = this.validation.arrayType !== 'string';
                return cellValue.stringValue?.split(',')?.map(item => {
                    num ? +item.trim() : item.trim();
                });
            case 'date':
            case 'date-time':
                let date: Date | undefined;
                if (cellValue.numberValue) {
                    date = SerialDate.toJSDate(cellValue.numberValue);
                } else if (cellValue.stringValue) {
                    date = new Date(cellValue.stringValue);
                }

                return date?.getTime() ? date : undefined;
        }
    }

}

export interface DscoColValidation {
    format?: 'string' | 'integer' | 'date-time' | 'date' | 'time' | 'number' | 'boolean' | 'array' | 'enum' | 'uri' | 'email';
    enumVals?: Set<string | number>;
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
