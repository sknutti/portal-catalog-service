import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GetUploadItemsSpreadsheetMigrateRetailModelsRequestBody {
    retailerId: number;
    skippedRowIndexes: number[];
}

export interface GetUploadItemsSpreadsheetMigrateRetailModelsResponse extends DsResponse {
    uploadUrl: string;
}

/**
 * Generates a presigned s3 url for the given catalog attribution category.
 * Users should upload a completed catalog item spreadsheet to this url.
 *
 * Accepts both xlsx and csv files
 */
export class GetUploadItemsSpreadsheetMigrateRetailModelsRequest extends DsRequest<
    GetUploadItemsSpreadsheetMigrateRetailModelsRequestBody,
    GetUploadItemsSpreadsheetMigrateRetailModelsResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GetUploadItemsSpreadsheetMigrateRetailModelsRequestBody) {
        super('POST', '/portal-catalog/spreadsheet/upload-url', DsRequest.getHost(env, 'micro'), body);
    }
}

/**
 * @deprecated - now called PublishCategorySpreadsheetRequest
 */
export const PublishUploadItemsSpreadsheetMigrateRetailModelsRequest =
    GetUploadItemsSpreadsheetMigrateRetailModelsRequest;
