import type {
    generateCategorySpreadsheet,
    GenerateCategorySpreadsheetEvent
} from '@bot/generate-category-spreadsheet/generate-category-spreadsheet';
import type {
    publishCategorySpreadsheet,
    PublishCategorySpreadsheetEvent
} from '@bot/publish-category-spreadsheet/publish-category-spreadsheet';
import type {
    updateCategorySpreadsheet,
    UpdateCategorySpreadsheetEvent
} from '@bot/update-category-spreadsheet/update-category-spreadsheet';
import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError, UnexpectedError } from '@dsco/ts-models';
import AWS from 'aws-sdk';
import { CategorySpreadsheetRequest } from './category-spreadsheet.request';

const lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
export const categorySpreadsheet = apiWrapper<CategorySpreadsheetRequest>(async (event) => {
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

    // These are long-running operations.  To prevent a 30 second timeout, we run them in a bot.  The bots use websockets to communicate with the client.
    switch (event.resource) {
        case '/spreadsheet':
            await invokeGenerateBot(user.accountId, event.body.retailerId, event.body.categoryPath);
            break;
        case '/spreadsheet/publish':
            await invokePublishBot(user.accountId, event.body.retailerId, user.userId, event.body.categoryPath);
            break;
        case '/spreadsheet/update':
            await invokeUpdateBot(user.accountId, event.body.retailerId, event.body.categoryPath);
            break;
        default:
            return new UnexpectedError('Unknown Resource', `Resource: ${event.resource}`);
    }
    return {
        success: true
    };
});


declare const __non_webpack_require__: typeof require;

async function invokeGenerateBot(supplierId: number, retailerId: number, categoryPath: string): Promise<void> {
    const event: GenerateCategorySpreadsheetEvent = {supplierId, retailerId, categoryPath};

    if (process.env.LEO_LOCAL === 'true') {
        // This invokes the webpack output for the generate-category-spreadsheet function.
        const generateFn: typeof generateCategorySpreadsheet = __non_webpack_require__('../../bot/generate-category-spreadsheet/generate-category-spreadsheet').generateCategorySpreadsheet;
        try {
            generateFn(event);
        } catch (e) {
            console.error(e);
        }
    } else {
        await lambda.invoke({
            FunctionName: process.env.GENERATE_BOT_NAME!,
            InvocationType: 'Event',
            Payload: JSON.stringify(event)
        }).promise();
    }
}

async function invokePublishBot(supplierId: number, retailerId: number, userId: number, categoryPath: string): Promise<void> {
    const event: PublishCategorySpreadsheetEvent = {supplierId, retailerId, userId, categoryPath};

    if (process.env.LEO_LOCAL === 'true') {
        // This invokes the webpack output for the publish-category-spreadsheet function.
        const publishFn: typeof publishCategorySpreadsheet = __non_webpack_require__('../../bot/publish-category-spreadsheet/publish-category-spreadsheet').publishCategorySpreadsheet;
        try {
            publishFn(event);
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


async function invokeUpdateBot(supplierId: number, retailerId: number, categoryPath: string): Promise<void> {
    const event: UpdateCategorySpreadsheetEvent = {supplierId, retailerId, categoryPath};

    if (process.env.LEO_LOCAL === 'true') {
        // This invokes the webpack output for the update-category-spreadsheet function.
        const updateFn: typeof updateCategorySpreadsheet = __non_webpack_require__('../../bot/update-category-spreadsheet/update-category-spreadsheet').updateCategorySpreadsheet;
        try {
            updateFn(event);
        } catch (e) {
            console.error(e);
        }
    } else {
        await lambda.invoke({
            FunctionName: process.env.UPDATE_BOT_NAME!,
            InvocationType: 'Event',
            Payload: JSON.stringify(event)
        }).promise();
    }
}
