import { CatalogImage, PipelineErrorType } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { extractFieldFromCoreCatalog, getDSFField } from '@lib/format-conversions';
import { DscoCatalogRow } from '@lib/spreadsheet/dsco-catalog-row';
import { assertUnreachable } from '@lib/utils';

/**
 * Represents a single column in the spreadsheet.
 * Contains validation information, and can be used to extract data from catalog
 */
export class DscoColumn {
    /**
     * The colon and space here are intentionally breaking the extended attributes requirements for field names.
     * This ensures name collisions can't happen.
     */
    static readonly DSCO_PREFIX = 'Dsco: ';

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
            required: 'none',
        },
    ) {}

    writeCellValueToCatalog(
        cellValue: CellValue,
        row: DscoCatalogRow,
        existingCatalog: CoreCatalog | undefined,
        retailerId: number,
    ): void {
        const valueToSet = this.coerceCatalogValueFromCellValue(cellValue);

        if (valueToSet === null) {
            // We don't actually write a null value to the catalog, at risk of overwriting fields that were set outside the catalog
            return;
        }

        const catalog = row.catalog;

        if (this.validation.format === 'image') {
            // Images need to be handled differently
            const [arrName, imgName] = this.imageNames;
            const arr: CatalogImage[] = (catalog[arrName] = catalog[arrName] || []);
            let found = arr.find((img) => img.name === imgName);
            if (!found) {
                found = {
                    name: imgName,
                };
                arr.push(found);
            }

            if (found.source_url !== valueToSet) {
                row.modified = true;
            }

            found.source_url = valueToSet as string; // the coerceCatalogValueFromCellValue only returns strings or null for image format
        } else if (this.type === 'core') {
            const valToSave =
                this.fieldName === 'sku' && typeof valueToSet === 'string' ? valueToSet.toUpperCase() : valueToSet;

            if (existingCatalog && extractFieldFromCoreCatalog(this.fieldName, existingCatalog) != valueToSet) {
                row.modified = true;
            }

            // The core automatically uppercases all skus.  This ensures nothing goes out of date.
            catalog[getDSFField(this.fieldName)] = valToSave;
        } else if (this.type === 'extended') {
            const extended = catalog.extended_attributes![retailerId];
            const existingExtended = existingCatalog?.extended_attributes?.[retailerId];

            if (existingExtended && existingExtended[this.fieldName] !== valueToSet) {
                row.modified = true;
            }

            extended[this.fieldName] = valueToSet;
        }

        // Even though there is technically a value, the value is the default, so keep emptyRow true
        if (this.validation.format === 'boolean' && valueToSet === false) {
            return;
        }

        row.emptyRow = false;
    }

    private coerceCatalogValueFromCellValue(
        cellValue: CellValue,
    ): string | Date | number | boolean | null | Array<string | number> {
        if (cellValue === null || cellValue === undefined || cellValue === '') {
            return null;
        }

        switch (this.validation.format) {
            case 'string':
            case 'enum':
            case 'email':
            case 'uri':
            case 'image':
                return cellValue.toString();
            case 'number':
            case 'integer':
                return +cellValue;
            case 'boolean':
                if (typeof cellValue === 'string') {
                    const upper = cellValue.toUpperCase();

                    if (upper === 'NO' || upper === 'FALSE' || upper === '0') {
                        return false;
                    }
                }

                return !!cellValue;
            case 'array': {
                const num = this.validation.arrayType !== 'string';
                if (typeof cellValue !== 'string') {
                    if (num) {
                        const numVal = +cellValue;
                        return isNaN(numVal) ? [] : [numVal];
                    } else {
                        return [cellValue.toString()];
                    }
                } else {
                    return cellValue.split(',').map((item) => {
                        return num ? +item.trim() : item.trim();
                    });
                }
            }
            case 'date':
            case 'date-time':
                // TODO: If the user specifies the date "January 1", should we store it as UTC Jan 1 or Jan 1 in their preferred timezone?
                return cellValue instanceof Date
                    ? cellValue
                    : typeof cellValue === 'string'
                    ? new Date(cellValue)
                    : null;
            case 'time': // TODO: Dsco doesn't really have a time format.  I'm just assuming it's going to be a string
                return cellValue.toString();
            case undefined:
                return cellValue; // We don't know the expected type, let anything through
            default:
                assertUnreachable(this.validation.format, 'DscoColFormat', 'coerceCatalogValueFromCellValue');
        }
    }
}

export type CellValue = string | number | boolean | Date | undefined;

export interface DscoColValidation {
    format?: DscoColFormat;
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

export type DscoColFormat =
    | 'string'
    | 'integer'
    | 'date-time'
    | 'date'
    | 'time'
    | 'number'
    | 'boolean'
    | 'array'
    | 'enum'
    | 'uri'
    | 'email'
    | 'image';
