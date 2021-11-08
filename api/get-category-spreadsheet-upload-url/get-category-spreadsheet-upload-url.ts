import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getIsRunningLocally, getLeoAuthUserTable } from '@lib/environment';
import { CatalogSpreadsheetS3Metadata, createCatalogItemS3UploadPath, getSignedS3Url } from '@lib/s3';
import { GetCategorySpreadsheetUploadUrlRequest } from './get-category-spreadsheet-upload-url.request';

export const getCategorySpreadsheetUploadUrl = apiWrapper<GetCategorySpreadsheetUploadUrlRequest>(async (event) => {
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

    const { retailerId, categoryPath, skippedRowIndexes } = event.body;

    const uploadMeta: CatalogSpreadsheetS3Metadata = {
        category_path: categoryPath,
        skipped_row_indexes: skippedRowIndexes?.join(','),
        is_local_test: getIsRunningLocally() ? 'true' : undefined,
    };

    return {
        success: true,
        uploadUrl: await getSignedS3Url(
            createCatalogItemS3UploadPath(user.accountId, retailerId, user.userId, categoryPath),
            uploadMeta,
        ),
    };
});
