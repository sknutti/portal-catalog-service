import {
    publishCategorySpreadsheet as publishSpreadsheetBot,
    PublishCategorySpreadsheetEvent
} from '@bot/publish-category-spreadsheet/publish-category-spreadsheet';
import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import AWS from 'aws-sdk';
import { PublishCategorySpreadsheetRequest } from './publish-category-spreadsheet.request';

const lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
export const publishCategorySpreadsheet = apiWrapper<PublishCategorySpreadsheetRequest>(async event => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    if (!event.body.categoryPath) {
        return new MissingRequiredFieldError('categoryPath');
    }
    if (!event.body.gzippedFile) {
        return new MissingRequiredFieldError('gzippedFile');
    }

    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const supplierId = user.accountId;
    const {retailerId, categoryPath, gzippedFile, skippedRowIndexes} = event.body;

    await invokePublishBot({
        retailerId,
        categoryPath,
        gzippedFile,
        skippedRowIndexes,
        supplierId,
        userId: user.userId
    });

    return {
        success: true
    };
});

declare const __non_webpack_require__: typeof require;

async function invokePublishBot(event: PublishCategorySpreadsheetEvent): Promise<void> {
    if (process.env.LEO_LOCAL === 'true') {
        // This invokes the webpack output for the generate-category-spreadsheet function.
        const generateFn: typeof publishSpreadsheetBot = __non_webpack_require__('../../bot/publish-category-spreadsheet/publish-category-spreadsheet').publishCategorySpreadsheet;
        try {
            generateFn(event);
        } catch (e) {
            console.error(e);
        }
    } else {
        await lambda.invoke({
            FunctionName: process.env.PUBLISH_BOT_NAME!,
            InvocationType: 'Event',
            Payload: JSON.stringify(event)
        }).promise();
    }
}
