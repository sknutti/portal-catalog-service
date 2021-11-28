import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GenerateCategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
}

export interface GenerateCategorySpreadsheetResponse extends DsResponse {
    /**
     * The presigned s3 download url
     */
    downloadUrl: string;
}

/**
 * Generates an excel spreadsheet for a given catalog attribution category.
 *
 * For example: A supplier is wanting to upload items to the "Shoes" category, so they use this api to generate a spreadsheet
 */
export class GenerateCategorySpreadsheetRequest extends DsRequest<
    GenerateCategorySpreadsheetRequestBody,
    GenerateCategorySpreadsheetResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GenerateCategorySpreadsheetRequestBody) {
        super('POST', '/portal-catalog/spreadsheet', DsRequest.getHost(env, 'micro'), body);
    }
}
