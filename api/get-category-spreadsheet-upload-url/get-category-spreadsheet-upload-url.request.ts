import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GetCategorySpreadsheetUploadUrlRequestBody {
    retailerId: number;
    categoryPath: string;
    skippedRowIndexes: number[];
}

export interface GetCategorySpreadsheetUploadUrlResponse extends DsResponse {
    uploadUrl: string;
}

/**
 * Generates a presigned s3 url for the given catalog attribution category.
 * Users should upload a completed catalog item spreadsheet to this url.
 *
 * Accepts both xlsx and csv files
 */
export class GetCategorySpreadsheetUploadUrlRequest extends DsRequest<
    GetCategorySpreadsheetUploadUrlRequestBody,
    GetCategorySpreadsheetUploadUrlResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GetCategorySpreadsheetUploadUrlRequestBody) {
        super('POST', '/portal-catalog/spreadsheet/upload-url', DsRequest.getHost(env, 'micro'), body);
    }
}

/**
 * @deprecated - now called PublishCategorySpreadsheetRequest
 */
export const PublishCategorySpreadsheetRequest = GetCategorySpreadsheetUploadUrlRequest;
