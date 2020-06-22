import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { apiWrapper, getUser } from '@dsco/service-utils';
import {
    Catalog, CatalogImage, DsError,
    MissingRequiredFieldError,
    UnauthorizedError,
    UnexpectedError, ValidationMessage,
    XrayActionSeverity
} from '@dsco/ts-models';
import { sheets_v4 } from 'googleapis';
import { DscoColumn } from '../../lib/dsco-column';
import { generateSpreadsheetCols } from '../../lib/generate-spreadsheet';
import { prepareGoogleApis } from '../../lib/google-api-utils';
import { SpreadsheetDynamoTable } from '../../lib/spreadsheet-dynamo-table';
import { PublishCategorySpreadsheetRequest } from './publish-category-spreadsheet.request';
import Schema$Sheet = sheets_v4.Schema$Sheet;

const spreadsheetDynamoTable = new SpreadsheetDynamoTable();

export const publishCategorySpreadsheet = apiWrapper<PublishCategorySpreadsheetRequest>(async event => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    if (!event.body.categoryPath) {
        return new MissingRequiredFieldError('categoryPath');
    }

    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const savedSheet = await spreadsheetDynamoTable.getItem(user.accountId, event.body.retailerId, event.body.categoryPath);
    if (!savedSheet) {
        return new UnexpectedError('No spreadsheet found for given params.', JSON.stringify(event.body));
    }

    const {sheets, cleanupGoogleApis} = await prepareGoogleApis();

    const resp = await sheets.spreadsheets.get({
        spreadsheetId: savedSheet.spreadsheetId,
        // ranges: [`A:${getColumnName(attributes.length - 1)}`],
        fields: 'sheets(data(rowData(values(formattedValue))))',
        includeGridData: true
    });

    await cleanupGoogleApis();

    const colsOrErr = await generateSpreadsheetCols(user.accountId, event.body.retailerId, event.body.categoryPath);

    if (!Array.isArray(colsOrErr)) {
        return colsOrErr;
    }

    const catalogs = generateCatalogsFromSpreadsheet(resp.data.sheets![0], colsOrErr, user.accountId, event.body.retailerId, event.body.categoryPath);

    const responses: Array<ResolveExceptionGearmanApiResponse | DsError> = await Promise.all(catalogs.map(catalog => {
        return new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: user.accountId!.toString(10),
                user_id: user.userId.toString(10)
            },
            params: catalog.toSnakeCase()
        }).submit();
    }));

    let validationMessages: ValidationMessage[] = [];

    for (const response of responses) {
        const messages = (response as any).validation_messages;
        if (messages?.length) {
            validationMessages = validationMessages.concat(messages);
        }
    }

    // TODO: REmove ' from start of cells

    return {
        success: true,
        validationMessages
    };
});

function generateCatalogsFromSpreadsheet(sheet: Schema$Sheet, cols: DscoColumn[], supplierId: number, retailerId: number, categoryPath: string): Catalog[] {
    const result: Catalog[] = [];

    const attributeNames: Record<number, string | undefined | null> = {};

    const rowData = sheet.data?.[0]?.rowData || [];
    for (let rowNum = 0; rowNum < rowData.length; rowNum++) {
        const cells = rowData[rowNum].values || [];
        const parsedRow: ParsedRow = {
            rowNum: rowNum + 1,
            values: {}
        };
        let saveObject = false;

        for (let cellNum = 0; cellNum < cells.length; cellNum++) {
            const cell = cells[cellNum];

            if (rowNum === 0) {
                attributeNames[cellNum] = cell.formattedValue;
                continue;
            }

            const attrName = attributeNames[cellNum];
            // If there is a value, save it.  Ig
            if (attrName && typeof cell.formattedValue === 'string') {
                // If the only thing being saved is a boolean, ignore the row
                saveObject = saveObject || (cell.formattedValue !== 'TRUE' && cell.formattedValue !== 'FALSE');
                parsedRow.values[attrName] = cell.formattedValue;
            }
        }

        if (saveObject) {
            result.push(validateAndCreateCatalog(parsedRow, cols, supplierId, retailerId, categoryPath));
        }
    }

    return result;
}

function validateAndCreateCatalog(parsedRow: ParsedRow, cols: DscoColumn[], supplierId: number, retailerId: number, categoryPath: string): Catalog {
    const extended: Record<string, any> = {};
    const images: CatalogImage[] = [];

    const catalog = new Catalog({
        supplierId: supplierId.toString(10),
        categories: {
            [retailerId]: [categoryPath]
        },
        extendedAttributes: {
            [retailerId]: extended
        },
        images
    });

    for (const col of cols) {
        if (!(col.name in parsedRow.values)) {
            if (col.validation.required === XrayActionSeverity.error) {
                throw new Error(`Missing required field on row ${parsedRow.rowNum}: ${col.name}`);
            }

            continue;
        }

        const coerced = coerceValue(parsedRow.values[col.name], col, parsedRow.rowNum);

        if (col.isCore) {
            (catalog as any)[col.name] = coerced;
        }
        if (col.isExtended) {
            extended[col.name] = coerced;
        }
    }

    // Handle images
    let imageNum = 1;
    while (`image_${imageNum}_name` in parsedRow.values) {
        const image = new CatalogImage({
            name: parsedRow.values[`image_${imageNum}_name`],
            reference: parsedRow.values[`image_${imageNum}_url`]
        });

        if (image.name && image.reference) {
            images.push(image);
        }

        imageNum++;
    }


    return catalog;
}

function coerceValue(value: string, col: DscoColumn, rowNum: number): string | number | boolean | Date | Array<string | number>  {
    switch (col.validation.format) {
        case 'string':
        case 'email':
        case 'uri':
        case 'time':
            return value;
        case 'integer':
            const int = +value;
            if (!Number.isInteger(int)) {
                throw `Invalid integer on row ${rowNum}: ${value}`;
            }
            return int;
        case 'number':
            const float = +value;
            if (isNaN(float)) {
                throw `Invalid integer on row ${rowNum}: ${value}`;
            }
            return float;
        case 'enum':
            const numValue = +value;
            if (!isNaN(numValue) && col.validation.enumVals?.has(numValue)) {
                return numValue;
            } else if (col.validation.enumVals?.has(value)) {
                return value;
            } else {
                throw `Invalid Enum on row ${rowNum}: ${value}`;
            }
        case 'boolean':
            const bool = value === 'TRUE';
            if (!bool && value !== 'FALSE') {
                throw `Invalid Bool on row ${rowNum}: ${value}`;
            }
            return bool;
        case 'array':
            const isNum = col.validation.arrayType !== 'string';
            return isNum ? value.split(',').map(val => +val) : value.split(',');
        case 'date':
        case 'date-time':
            console.error('Got date value: ', value);
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw `Invalid date on row ${rowNum}: ${value}`;
            }
            return date;
        default:
            console.error('Column without known type: ', col.name);
            return value;
    }
}

interface ParsedRow {
    values: Record<string, string>;
    rowNum: number;
}
