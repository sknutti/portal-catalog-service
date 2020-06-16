import { ResolveExceptionGearmanApi } from '@dsco/gearman-apis';
import { apiWrapper, getUser } from '@dsco/service-utils';
import {
    AttributeDataType,
    AttributeRequiredType,
    AttributionCategoryAttribute,
    Catalog,
    InvalidFieldError,
    MissingRequiredFieldError,
    UnauthorizedError
} from '@dsco/ts-models';
import { sheets_v4 } from 'googleapis';
import { getColumnName, prepareGoogleApis } from '../../lib/google-api-utils';
import { PublishCategorySpreadsheetRequest } from './publish-category-spreadsheet.request';
import Schema$Sheet = sheets_v4.Schema$Sheet;


export const publishCategorySpreadsheet = apiWrapper<PublishCategorySpreadsheetRequest>(async event => {
    if (!event.body.attributes || !Array.isArray(event.body.attributes)) {
        return new MissingRequiredFieldError('attributes');
    }
    const attributes = event.body.attributes as AttributionCategoryAttribute[];

    if (typeof event.body.spreadsheetUrl !== 'string') {
        return new MissingRequiredFieldError('spreadsheetUrl');
    }

    const spreadsheetId = event.body.spreadsheetUrl.match(/\/spreadsheets\/d\/(.*?)\//)?.[1];
    if (!spreadsheetId) {
        return new InvalidFieldError('spreadsheetUrl', 'Should be a valid google sheets url');
    }

    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId) {
        return new UnauthorizedError();
    }

    // TODO: Don't hardcode these
    const retailerId = '1000000001';
    const supplierId = '1000000920';
    const userId = '12542';

    const {sheets, cleanupGoogleApis} = await prepareGoogleApis();

    const resp = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [`A:${getColumnName(attributes.length - 1)}`],
        fields: 'sheets(data(rowData(values(formattedValue))))',
        includeGridData: true
    });

    await cleanupGoogleApis();

    const data = convertSheetToObjects(resp.data.sheets![0]);

    const catalogs = validateObjects(data, attributes, 'Electronics', supplierId, retailerId);

    const responses: any[] = [];
    for (const catalog of catalogs) {
        catalog.sku = 'spreadsheetupload01';
        (catalog as any).title = 'Better Spreadsheets!';
        (catalog as any).quantityAvailable = 3;
        (catalog as any).itemId = 1032132775;

        const resolved = await new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: supplierId,
                user_id: userId
            },
            params: catalog.toSnakeCase()
        }).submit();

        responses.push(resolved);
    }

    return {
        success: true,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?rm=minimal`,
        responses
    };
});

function convertSheetToObjects(sheet: Schema$Sheet): Record<string, string>[] {
    const result: Record<string, string>[] = [];

    const attributeNames: Record<number, string | undefined | null> = {};

    const rowData = sheet.data?.[0]?.rowData || [];
    for (let rowNum = 0; rowNum < rowData.length; rowNum++) {
        const cells = rowData[rowNum].values || [];
        const object: Record<string, string> = {};
        let saveObject = false;

        for (let cellNum = 0; cellNum < cells.length; cellNum++) {
            const cell = cells[cellNum];

            if (rowNum === 0) {
                attributeNames[cellNum] = cell.formattedValue;
                continue;
            }

            const attrName = attributeNames[cellNum];
            if (attrName && typeof cell.formattedValue === 'string') {
                saveObject = true;
                object[attrName] = cell.formattedValue;
            }
        }

        if (saveObject) {
            result.push(object);
        }
    }

    return result;
}

function validateObjects(objects: Array<Record<string, string>>, attributes: AttributionCategoryAttribute[], categoryName: string, supplierId: string, retailerId: string): Catalog[] {
    const result: Catalog[] = [];

    for (const object of objects) {
        const extended: Record<string, any> = {};

        const catalog = new Catalog({
            supplierId,
            categories: {
                [retailerId]: [categoryName]
            },
            extendedAttributes: {
                [retailerId]: extended
            }
        });

        for (const attribute of attributes) {
            if (!(attribute.name in object)) {
                if (attribute.requiredType === AttributeRequiredType.required) {
                    throw new Error(`Missing required field: ${attribute.name}`);
                }

                continue;
            }

            const coerced = coerceValue(object[attribute.name], attribute);

            if (attribute.dsco) {
                (catalog as any)[attribute.name] = coerced;
            } else {
                extended[attribute.name] = coerced;
            }
        }

        result.push(catalog);
    }

    return result;
}

function coerceValue(value: string, attribute: AttributionCategoryAttribute): any {
    switch (attribute.dataType) {
        case AttributeDataType.string:
            return value;
        case AttributeDataType.integer:
            const int = +value;
            if (!Number.isInteger(int)) {
                throw `Invalid integer: ${value}`;
            }
            return int;
        case AttributeDataType.float:
            const float = +value;
            if (isNaN(float)) {
                throw `Invalid integer: ${value}`;
            }
            return float;
        case AttributeDataType.enum:
            const enumVal = attribute.secondaryDataType === AttributeDataType.string ? value : +value;
            if (!attribute.possibleValues?.includes(enumVal)) {
                throw `Invalid Enum: ${value}`;
            }
            return enumVal;
        case AttributeDataType.boolean:
            const bool = value === 'TRUE';
            if (!bool && value !== 'FALSE') {
                throw `Invalid Bool: ${value}`;
            }
            return bool;
        case AttributeDataType.array:
            const isNum = attribute.secondaryDataType !== AttributeDataType.string;
            return isNum ? value.split(',').map(val => +val) : value.split(',');
    }
}
