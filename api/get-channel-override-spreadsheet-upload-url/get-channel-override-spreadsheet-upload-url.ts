import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getIsRunningLocally, getLeoAuthUserTable } from '@lib/environment';
import { ItemsUploadMigrateRetailModelSpreadsheetS3Metadata, createCatalogItemS3UploadPath, getSignedS3UploadUrlMigrateRetailModel } from '@lib/s3';
import { GetUploadItemsSpreadsheetMigrateRetailModelsRequest } from './get-upload-items-spreadsheet-migrate-retail-models.request';

export const getUploadItemsSpreadsheetMigrateRetailModelsUrl = apiWrapper<GetUploadItemsSpreadsheetMigrateRetailModelsRequest>(async (event) => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    
    const user = await getUser(event.requestContext, getLeoAuthUserTable());

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const { retailerId, skippedRowIndexes } = event.body;

    const uploadMeta: ItemsUploadMigrateRetailModelSpreadsheetS3Metadata = {
        skipped_row_indexes: skippedRowIndexes?.join(','),
        is_local_test: getIsRunningLocally() ? 'true' : undefined,
    };

    return {
        success: true,
        uploadUrl: await getSignedS3UploadUrlMigrateRetailModel(
            createCatalogItemS3UploadPath(user.accountId, retailerId, user.userId,'spreadsheets'),
            uploadMeta,
        ),
    };
});
