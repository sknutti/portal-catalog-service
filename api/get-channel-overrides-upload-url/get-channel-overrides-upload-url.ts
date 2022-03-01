import { apiWrapper, getUser } from '@dsco/service-utils';
import { UnauthorizedError } from '@dsco/ts-models';
import { getIsRunningLocally, getLeoAuthUserTable } from '@lib/environment';
import {
    CatalogChannelOverrideSpreadsheetUploadS3Metadata,
    createCatalogChannelOverridesS3UploadPath,
    getSignedChannelOverridesS3UploadUrl,
} from '@lib/s3';
import { GetChannelOverridesSpreadsheetUploadUrlRequest } from './get-channel-overrides-upload-url.request';
import * as uuid from 'uuid';
import { getConfig } from '@lib/utils/consul/api_consul';

export const getChannelOverridesSpreadsheetUploadUrl = apiWrapper<GetChannelOverridesSpreadsheetUploadUrlRequest>(
    async (event, ctx) => {
        const user = await getUser(event.requestContext, getLeoAuthUserTable());

        // Must be logged in
        if (!user?.accountId) {
            return new UnauthorizedError();
        }

        const cfg = await getConfig();

        const correlationId = uuid.v4();
        const uploadMeta: CatalogChannelOverrideSpreadsheetUploadS3Metadata = {
            is_local_test: getIsRunningLocally() ? 'true' : undefined,
            createDate: new Date(),
            accountId: `${user.accountId}`,
            accountType: 'RETAILER',
            userId: `${user.userId}`,
            correlationId,
            itemType: cfg.api_microservice.catalog_override_large_batch.upload_dir,
            clUuid: ctx.awsRequestId,
            sourceIpAddress: event.requestContext.identity.sourceIp,
        };

        return {
            success: true,
            uploadUrl: await getSignedChannelOverridesS3UploadUrl(
                createCatalogChannelOverridesS3UploadPath(user.accountId, user.userId, 'spreadsheets', correlationId),
                uploadMeta,
            ),
        };
    },
);
