import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GetChannelOverridesSpreadsheetUploadUrlRequestBody {
    retailerId: number;
}

export interface GetChannelOverridesSpreadsheetUploadUrlResponse extends DsResponse {
    uploadUrl: string;
}

/**
 * Generates a presigned s3 url for the given catalog attribution category.
 * Users should upload a completed catalog item spreadsheet to this url.
 *
 * Accepts both xlsx and csv files
 */
export class GetChannelOverridesSpreadsheetUploadUrlRequest extends DsRequest<
    GetChannelOverridesSpreadsheetUploadUrlRequestBody,
    GetChannelOverridesSpreadsheetUploadUrlResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GetChannelOverridesSpreadsheetUploadUrlRequestBody) {
        super('POST', '/portal-catalog/spreadsheet/channel-overrides-upload-url', DsRequest.getHost(env, 'micro'), body);
    }
}
