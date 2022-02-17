import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getIsRunningLocally, getLeoAuthUserTable } from '@lib/environment';
import { ChannelOverrideSpreadsheetUploadS3Metadata, createCatalogChannelOverridesS3UploadPath, getSignedS3UploadChannelOverrides } from '@lib/s3';
import { GetChannelOverridesSpreadsheetUploadUrlRequest } from './get-channel-overrides-spreadsheet-upload-url.request';

export const getChannelOverridesSpreadsheetUploadUrl = apiWrapper<GetChannelOverridesSpreadsheetUploadUrlRequest>(async (event) => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    
    const user = await getUser(event.requestContext, getLeoAuthUserTable());

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const { retailerId, skippedRowIndexes } = event.body;

    const uploadMeta: ChannelOverrideSpreadsheetUploadS3Metadata = {
        skipped_row_indexes: skippedRowIndexes?.join(','),
        is_local_test: getIsRunningLocally() ? 'true' : undefined,
    };

    return {
        success: true,
        uploadUrl: await getSignedS3UploadChannelOverrides(
            createCatalogChannelOverridesS3UploadPath(user.accountId, retailerId, user.userId,'spreadsheets'),
            uploadMeta,
        ),
    };
});
