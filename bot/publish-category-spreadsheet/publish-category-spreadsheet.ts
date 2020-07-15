import { SpreadsheetRowMessage } from '@api';
import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { XrayActionSeverity } from '@dsco/ts-models';
import { DscoCatalogRow } from '@lib/dsco-catalog-row';
import { DscoSpreadsheet } from '@lib/dsco-spreadsheet';
import { generateSpreadsheet } from '@lib/generate-spreadsheet';
import { prepareGoogleApis } from '@lib/google-api-utils';
import { GoogleSpreadsheet } from '@lib/google-spreadsheet';
import { sendWebsocketEvent } from '@lib/send-websocket-event';
import { verifyCategorySpreadsheet } from '@lib/verify-category-spreadsheet';

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

const VALIDATING_PROGRESS_START_PCT = 0.63;

export async function publishCategorySpreadsheet({categoryPath, retailerId, supplierId, userId}: PublishCategorySpreadsheetEvent): Promise<void> {
    const sendProgress = (progress: number, message: string) => {
        return sendWebsocketEvent('publishCatalogSpreadsheetProgress', {progress, message, categoryPath}, supplierId);
    };

    await sendProgress(0.2, 'Verifying spreadsheet is up to date...');

    // First, we verify the spreadsheet, refusing to publish if it is out of date
    const {savedSheet, outOfDate} = await verifyCategorySpreadsheet(categoryPath, supplierId, retailerId);
    if (!savedSheet || outOfDate) {
        await sendWebsocketEvent('publishCatalogSpreadsheetFail', {
            reason: outOfDate ? 'out-of-date' : 'no-spreadsheet-found'
        }, supplierId);
        return;
    }

    await sendProgress(0.3, 'Loading Dsco schema & attribution data...');

    // Then we generate a DscoSpreadsheet, giving us column & validation info
    const dscoSpreadsheet = await generateSpreadsheet(supplierId, retailerId, categoryPath);
    if (!(dscoSpreadsheet instanceof DscoSpreadsheet)) {
        throw dscoSpreadsheet; // TODO: Handle this error
    }

    await sendProgress(0.45, 'Loading spreadsheet...');

    const {sheets, cleanupGoogleApis} = await prepareGoogleApis();
    const googleSpreadsheet = await GoogleSpreadsheet.loadFromGoogle(savedSheet.spreadsheetId, sheets);
    await cleanupGoogleApis();


    await sendProgress(VALIDATING_PROGRESS_START_PCT, 'Validating & saving rows...');

    const rowMessages: Record<number, SpreadsheetRowMessage[]> = {};
    const addRowMessage = (row: number, message: SpreadsheetRowMessage) => {
        let messages = rowMessages[row];
        if (!messages) {
            messages = rowMessages[row] = [];
        }
        messages.push(message);
    };

    // Only save the rows that haven't been published
    const unpublishedCatalogs = DscoCatalogRow.fromExistingSheet(googleSpreadsheet, dscoSpreadsheet, supplierId, retailerId, categoryPath).filter(
      row => !row.published
    );

    const responses = await Promise.all(resolveCatalogsWithProgress(unpublishedCatalogs, userId, supplierId, categoryPath));

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

function resolveCatalogsWithProgress(unpublishedCatalogs: DscoCatalogRow[], userId: number, supplierId: number, categoryPath: string): Array<Promise<ResolveExceptionGearmanApiResponse>> {
    const total = unpublishedCatalogs.length;
    let current = 0;

    let lastSendTime = 0;
    const THROTTLE_TIME = 300;

    return unpublishedCatalogs.map(async catalog => {
        const response = await new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: supplierId!.toString(10),
                user_id: userId.toString(10)
            },
            params: catalog.catalog
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
