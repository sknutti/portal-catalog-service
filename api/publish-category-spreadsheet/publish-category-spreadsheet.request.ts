import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface PublishCategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
    /**
     * Should be a binary string containing the gzipped file
     */
    gzippedFile?: string;
    skippedRowIndexes: number[];
}

export interface PublishCategoryResponse extends DsResponse {
    uploadUrl: string;
}

export class PublishCategorySpreadsheetRequest extends DsRequest<
    PublishCategorySpreadsheetRequestBody,
    PublishCategoryResponse,
    DsError
> {
    constructor(env: DscoEnv, body: PublishCategorySpreadsheetRequestBody) {
        super('POST', '/portal-catalog/spreadsheet/publish', DsRequest.getHost(env, 'micro'), body);
    }
}
