import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';
import { ChannelOverride } from '@dsco/bus-models';

export interface CatalogItemOverridesSmallBatchRequestBody {
    retailerId: string;
    channelOverrides: ChannelOverride[];
}

export interface CatalogItemOverridesSmallBatchResponse extends DsResponse {
    message: string;
}

export class CatalogItemOverridesSmallBatchRequest extends DsRequest<
    CatalogItemOverridesSmallBatchRequestBody,
    CatalogItemOverridesSmallBatchResponse,
    DsError
> {
    constructor(env: DscoEnv, body: CatalogItemOverridesSmallBatchRequestBody) {
        super('POST', '/portal/channel/overrides/batch/small', DsRequest.getHost(env, 'micro'), body);
    }
}
