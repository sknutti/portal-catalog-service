import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getIsRunningLocally, getLeoAuthUserTable } from '@lib/environment';
import {
    CatalogChannelOverrideSpreadsheetUploadS3Metadata,
    createCatalogChannelOverridesS3UploadPath,
    getSignedChannelOverridesS3UploadUrl,
} from '@lib/s3';
import { GetChannelOverridesSpreadsheetUploadUrlRequest } from './get-channel-overrides-upload-url.request';

export const getChannelOverridesSpreadsheetUploadUrl = apiWrapper<GetChannelOverridesSpreadsheetUploadUrlRequest>(
    async (event) => {
        const user = await getUser(event.requestContext, getLeoAuthUserTable());

        // Must be logged in
        if (!user?.accountId) {
            return new UnauthorizedError();
        }
        const uploadMeta: CatalogChannelOverrideSpreadsheetUploadS3Metadata = {
            is_local_test: getIsRunningLocally() ? 'true' : undefined,
        };

        return {
            success: true,
            uploadUrl: await getSignedChannelOverridesS3UploadUrl(
                createCatalogChannelOverridesS3UploadPath(user.accountId, user.userId, 'spreadsheets'),
                uploadMeta,
            ),
        };
    },
);
