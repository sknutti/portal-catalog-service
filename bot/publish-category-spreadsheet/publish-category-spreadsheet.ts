import { SpreadsheetRowMessage } from '@api';
import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { CatalogImage, XrayActionSeverity } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { DscoColumn } from '@lib/dsco-column';
import { generateSpreadsheetCols } from '@lib/generate-spreadsheet';
import { parseValueFromSpreadsheet, prepareGoogleApis } from '@lib/google-api-utils';
import { sendWebsocketEvent } from '@lib/send-websocket-event';
import { verifyCategorySpreadsheet } from '@lib/verify-category-spreadsheet';
import { sheets_v4 } from 'googleapis';

export interface PublishCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
}

const gearmanActionSuccess: Set<string> = new Set([
    'SAVED',
    'CREATED',
    'UPDATED',
    'SUCCESS',
]);

const VALIDATING_PROGRESS_START_PCT = 0.66;

export async function publishCategorySpreadsheet({categoryPath, retailerId, supplierId, userId}: PublishCategorySpreadsheetEvent): Promise<void> {
    await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.2,
        message: 'Loading spreadsheet...'
    }, supplierId);

    const {savedSheet, outOfDate} = await verifyCategorySpreadsheet(categoryPath, supplierId, retailerId);
    if (!savedSheet || outOfDate) {
        await sendWebsocketEvent('publishCatalogSpreadsheetFail', {
            reason: outOfDate ? 'out-of-date' : 'no-spreadsheet-found'
        }, supplierId);
        return;
    }

    const {sheets, cleanupGoogleApis} = await prepareGoogleApis();

    const resp = await sheets.spreadsheets.get({
        spreadsheetId: savedSheet.spreadsheetId,
        // ranges: [`A:${getColumnName(attributes.length - 1)}`],
        fields: 'sheets(data(rowData(values(formattedValue))))',
        includeGridData: true
    });

    await cleanupGoogleApis();

    await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.2,
        message: 'Loading Dsco schema & attribution data...'
    }, supplierId);

    const colsOrErr = await generateSpreadsheetCols(supplierId, retailerId, categoryPath);

    await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
        categoryPath,
        progress: 0.45,
        message: 'Parsing spreadsheet...'
    }, supplierId);

    if (!Array.isArray(colsOrErr)) {
        throw colsOrErr;
    }

    const rowMessages: Record<number, SpreadsheetRowMessage[]> = {};
    const addRowMessage = (row: number, message: SpreadsheetRowMessage) => {
        let messages = rowMessages[row];
        if (!messages) {
            messages = rowMessages[row] = [];
        }
        messages.push(message);
    };

    const catalogs = generateCatalogsFromSpreadsheet(resp.data.sheets![0], colsOrErr, supplierId, retailerId, categoryPath, addRowMessage);

    await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
        categoryPath,
        progress: VALIDATING_PROGRESS_START_PCT,
        message: 'Validating & saving rows...'
    }, supplierId);

    const responses = await Promise.all(resolveCatalogsWithProgress(catalogs, userId, supplierId, categoryPath));

    let rowNum = 2; // row 1 is the header
    for (const response of responses) {
        const successfullySaved = gearmanActionSuccess.has(response.action);

        let hasErrorMessage = false;

        for (const msg of response.validation_messages || []) {
            addRowMessage(rowNum, msg);
            hasErrorMessage = hasErrorMessage || msg.messageType === XrayActionSeverity.error;
        }

        if (!successfullySaved && !hasErrorMessage) {
            const messages = response.messages?.length ? response.messages : ['Unable to save item.'];

            for (const message of messages) {
                addRowMessage(rowNum, {message, messageType: XrayActionSeverity.error});
            }
        }

        rowNum++;
    }

    await sendWebsocketEvent('publishCatalogSpreadsheetSuccess', {
        categoryPath,
        rowMessages
    }, supplierId);
}

function resolveCatalogsWithProgress(catalogs: CoreCatalog[], userId: number, supplierId: number, categoryPath: string): Array<Promise<ResolveExceptionGearmanApiResponse>> {
    const total = catalogs.length;
    let current = 0;

    let lastSendTime = 0;
    const THROTTLE_TIME = 300;

    return catalogs.map(async catalog => {
        const response = await new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: supplierId!.toString(10),
                user_id: userId.toString(10)
            },
            params: catalog
        }).submit();

        current++;

        const now = Date.now();
        if (now - lastSendTime > THROTTLE_TIME) {
            lastSendTime = now;
            await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
                categoryPath,
                progress: VALIDATING_PROGRESS_START_PCT + ((1 - VALIDATING_PROGRESS_START_PCT) * (current / total)),
                message: `Validating & saving rows ${current}/${total}...`
            }, supplierId);
        }

        return response;
    });
}

function generateCatalogsFromSpreadsheet(sheet: sheets_v4.Schema$Sheet, cols: DscoColumn[], supplierId: number, retailerId: number, categoryPath: string, addRowMessage: (row: number, message: SpreadsheetRowMessage) => void): CoreCatalog[] {
    const result: CoreCatalog[] = [];

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
                attributeNames[cellNum] = parseValueFromSpreadsheet(cell.formattedValue || '');
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
            try {
                result.push(validateAndCreateCatalog(parsedRow, cols, supplierId, retailerId, categoryPath));
            } catch(e) {
                if (typeof e === 'string') { // Intentionally thrown, should be shown to user
                    addRowMessage(rowNum + 1, {
                        message: e,
                        messageType: XrayActionSeverity.error,
                    });
                } else {
                    throw e;
                }
            }
        }
    }

    return result;
}

function validateAndCreateCatalog(parsedRow: ParsedRow, cols: DscoColumn[], supplierId: number, retailerId: number, categoryPath: string): CoreCatalog {
    const extended: Record<string, any> = {};
    const images: CatalogImage[] = [];

    const catalog: CoreCatalog = {
        supplier_id: supplierId,
        categories: {
            [retailerId]: [categoryPath]
        },
        extended_attributes: {
            [retailerId]: extended
        },
        toSnakeCase: undefined,
        images
    };

    for (const col of cols) {
        if (!(col.name in parsedRow.values)) {
            if (col.validation.required === XrayActionSeverity.error) {
                throw `Missing required field: ${col.name}`;
            }

            continue;
        }

        const coerced = coerceValue(parsedRow.values[col.name], col);

        if (col.type === 'core') {
            catalog[col.fieldName] = coerced;
        } else if (col.type === 'extended') {
            extended[col.fieldName] = coerced;
        }
    }

    return catalog;
}

function coerceValue(value: string, col: DscoColumn): string | number | boolean | Date | Array<string | number>  {
    switch (col.validation.format) {
        case 'string':
        case 'email':
        case 'uri':
        case 'time':
            return value;
        case 'integer':
            const int = +value;
            if (!Number.isInteger(int)) {
                throw `Invalid number provided for ${col.name}: ${value}`;
            }
            return int;
        case 'number':
            const float = +value;
            if (isNaN(float)) {
                throw `Invalid number provided for ${col.name}: ${value}`;
            }
            return float;
        case 'enum':
            const numValue = +value;
            if (!isNaN(numValue) && col.validation.enumVals?.has(numValue)) {
                return numValue;
            } else if (col.validation.enumVals?.has(value)) {
                return value;
            } else {
                throw `Invalid Enum provided for ${col.name}: ${value}`;
            }
        case 'boolean':
            const bool = value === 'TRUE';
            if (!bool && value !== 'FALSE') {
                throw `Invalid Bool provided for ${col.name}: ${value}`;
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
                throw `Invalid date provided for ${col.name}: ${value}`;
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
