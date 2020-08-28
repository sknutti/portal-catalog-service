import { CatalogImage, PipelineErrorType } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { DscoCatalogRow, DscoSpreadsheet } from '@lib/spreadsheet';
import { SerialDate } from '@lib/utils';
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

    /**
     * Extracts [images, front_view] from "images.front_view"
     */
    get imageNames(): [string, string] {
        const matches = this.fieldName.match(/^(.*)\.(.*)$/); // Extracts images.myName into [images.myName, images, myName]
        if (!matches) {
            throw new Error(`Unknown image column name: ${this.fieldName}`);
        }

        return [matches[1], matches[2]];
    }

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
      public fieldDescription: string | undefined,
      public type: 'core' | 'extended' | 'transient', // Transient cols aren't directly mapped to dsco attributes.
      public validation: DscoColValidation = {
          required: 'none'
      },
      // Will be applied only on empty rows with no catalog data filled in
      public defaultValue?: Schema$ExtendedValue
    ) {
    }

    generateHeaderCell(): Schema$CellData {
        return {
            userEnteredValue: {stringValue: this.name},
            userEnteredFormat: {
                textFormat: {
                    fontFamily: 'Arial',
                    bold: true
                }
            },
            note: this.fieldDescription,
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
        this.generateValidationData(addEnumVals, rowData);

        return {
            userEnteredValue: rowData ? this.makeExtendedValue(rowData, retailerId) : this.defaultValue,
            dataValidation: this.dataValidation,
            userEnteredFormat: this.format
        };
    }

    /**
     * Reads the value from the given cell, storing it in the correct place in the rowData.
     *
     * Assumes extended_attributes[retailerId] exists
     */
    readDataFromExistingCell(cell: Schema$CellData, catalog: CoreCatalog, retailerId: number): 'empty' | 'hasValue' {
        // We ignore the modified col and pull that from the AppScriptSaveData
        if (this.name === DscoSpreadsheet.MODIFIED_COL_NAME) {
            return 'empty';
        }

        let valueToSet = this.getDataFromExtendedValue(cell.effectiveValue);
        if (valueToSet === undefined || valueToSet === null) {
            return 'empty';
        }

        if (this.validation.format === 'image') { // Images need to be handled differently
            const [arrName, imgName] = this.imageNames;
            const arr: CatalogImage[] = catalog[arrName] = catalog[arrName] || [];
            let found = arr.find(img => img.name === imgName);
            if (!found) {
                found = {
                    name: imgName
                };
                arr.push(found);
            }

            found.source_url = valueToSet;
        } else if (this.type === 'core') {
            if (this.fieldName === 'sku' && typeof valueToSet === 'string') {
                // The core automatically uppercases all skus.  This ensures nothing goes out of date.
                valueToSet = valueToSet.toUpperCase();
            }

            catalog[this.fieldName] = valueToSet;
        } else if (this.type === 'extended') {
            catalog.extended_attributes![retailerId]![this.fieldName] = valueToSet;
        }

        return 'hasValue';
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
        } else if (this.name === DscoSpreadsheet.MODIFIED_COL_NAME) {
            data = rowData.modified;
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
            case 'image':
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
     * @param rowData
     */
    private generateValidationData(addEnumVals: (vals: Array<string | number>) => string, rowData: DscoCatalogRow | undefined): void {
        if (this.fieldName === 'sku') {
            this.dataValidation = rowData?.savedToDsco ? {
                condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{userEnteredValue: `=EQ(INDIRECT("RC", false), "${rowData.catalog.sku}")`}]
                },
                strict: true,
                inputMessage: `Cannot modify a sku that has been saved to Dsco.  Must equal ${rowData.catalog.sku}.`
            } : undefined;

            return;
        }

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
            //  Intentionally left off date-time, as it improves the datepicker experience and isn't really needed for any catalog fields
            // this.format = {numberFormat: {type: format === 'date' ? 'DATE' : 'DATE_TIME', pattern: format === 'date' ? 'M/d/yyyy' : 'M/d/yyyy H:mm'}};
            this.format = {numberFormat: {type: 'DATE', pattern: 'M/d/yyyy'}};
        } else if (format === 'time') {
            this.format = {numberFormat: {type: 'TIME', pattern: 'H:mm'}};
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
        } else if (format === 'uri' || format === 'email' || format === 'image') {
            this.format = {numberFormat: {type: 'TEXT'}};
            this.dataValidation = {
                condition: {type: format === 'email' ? 'TEXT_IS_EMAIL' : 'TEXT_IS_URL'},
                showCustomUi: true,
                strict: true,
                inputMessage: `${this.name} must be ${format === 'email' ? 'an email' : 'a URL'}.`
            };
        } else if (format === 'array') {
            // TODO: Handle min and max length
            this.format = {numberFormat: {type: 'TEXT'}};
            this.dataValidation = arrayType !== 'string' ? {
                condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{userEnteredValue: '=AND(ARRAYFORMULA(ISNUMBER(SPLIT(INDIRECT("RC", false), ",", TRUE, TRUE))))'}]
                },
                strict: true,
                inputMessage: `${this.name} must be a comma-separated list of numbers (${arrayType === 'integer' ? 'no decimals' : 'decimals allowed'}).`
            } : undefined;
        }
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
            case 'image':
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
                // TODO: If the user specifies the date "January 1", should we store it as UTC Jan 1 or Jan 1 in their preferred timezone?
                let date: Date | undefined;
                if (cellValue.numberValue) {
                    date = SerialDate.toJSDate(cellValue.numberValue);
                } else if (cellValue.stringValue) {
                    date = new Date(cellValue.stringValue);
                }

                return date?.getTime() ? date : undefined;
            case 'time': // TODO: Dsco doesn't really have a time format.  I've assumed 'H:mm AM|PM'
                return cellValue.numberValue ? SerialDate.toTime(cellValue.numberValue) : cellValue.stringValue;
        }
    }

}

export interface DscoColValidation {
    format?: 'string' | 'integer' | 'date-time' | 'date' | 'time' | 'number' | 'boolean' | 'array' | 'enum' | 'uri' | 'email' | 'image';
    enumVals?: Set<string | number>;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    match?: string; // regex
    dontMatch?: string[]; // regex
    regexMessage?: string;
    required: PipelineErrorType | 'none';
    arrayType?: 'string' | 'integer' | 'number';
    dateInFuture?: boolean;
    minWidth?: number; // image
    minHeight?: number; // image
}
