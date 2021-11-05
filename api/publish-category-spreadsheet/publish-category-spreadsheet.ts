import type {
    publishCategorySpreadsheet as publishSpreadsheetBot,
    PublishCategorySpreadsheetEvent
} from '@bot/publish-category-spreadsheet/publish-category-spreadsheet';
import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getIsRunningLocally, getLeoAuthUserTable, getPublishBotName } from '@lib/environment';
import { CatalogSpreadsheetS3Metadata, createCatalogItemS3UploadPath, getSignedS3Url } from '@lib/s3';
import AWS from 'aws-sdk';
import { PublishCategorySpreadsheetRequest } from './publish-category-spreadsheet.request';

const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });
export const publishCategorySpreadsheet = apiWrapper<PublishCategorySpreadsheetRequest>(async (event) => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    if (!event.body.categoryPath) {
        return new MissingRequiredFieldError('categoryPath');
    }

    const user = await getUser(event.requestContext, getLeoAuthUserTable());

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const supplierId = user.accountId;
    const { retailerId, categoryPath, gzippedFile, skippedRowIndexes } = event.body;

    // gzippedFile used for backwards compatibility
    if (gzippedFile) {
        console.log('Found gzipped file, directly invoking publish bot');

        await invokePublishBot({
            retailerId,
            categoryPath,
            gzippedFile,
            skippedRowIndexes,
            supplierId,
            userId: user.userId,
        });
    } else {
        console.log('No gzipped file, generating s3 event');
    }

    const uploadMeta: CatalogSpreadsheetS3Metadata = {
        category_path: categoryPath,
        skipped_row_indexes: skippedRowIndexes?.join(','),
        is_local_test: getIsRunningLocally() ? 'true' : undefined
    };

    return {
        success: true,
        uploadUrl: await getSignedS3Url(createCatalogItemS3UploadPath(user.accountId, retailerId, user.userId, categoryPath), uploadMeta)
    };
});

declare const __non_webpack_require__: typeof require;

function invokePublishBot(event: PublishCategorySpreadsheetEvent): Promise<void> {
    if (getIsRunningLocally()) {
        // This invokes the webpack output for the generate-category-spreadsheet function.
        const generateFn: typeof publishSpreadsheetBot = __non_webpack_require__(
            '../../bot/publish-category-spreadsheet/publish-category-spreadsheet',
        ).publishCategorySpreadsheet;
        try {
            generateFn(event);
        } catch (e) {
            console.error(e);
        }
        return Promise.resolve();
    } else {
        // Invoke the lambda, resolving automatically after 5 seconds so the request can run in the background
        return new Promise((resolve) => {
            lambda
                .invoke({
                    FunctionName: getPublishBotName(),
                    InvocationType: 'RequestResponse',
                    Payload: JSON.stringify(event),
                })
                .promise()
                .then(() => resolve());

            setTimeout(() => resolve(), 5000);
        });
    }
}
