import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GenerateCatalogExceptionsSpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
}

export interface GenerateCatalogExceptionsSpreadsheetResponse extends DsResponse {
    /**
     * The presigned s3 download url
     */
    downloadUrl: string;
}

/**
 * Generates an xlsx spreadsheet for exceptions in a given catalog attribution category
 */
export class GenerateCatalogExceptionsSpreadsheetRequest extends DsRequest<
    GenerateCatalogExceptionsSpreadsheetRequestBody,
    GenerateCatalogExceptionsSpreadsheetResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GenerateCatalogExceptionsSpreadsheetRequestBody) {
        super('POST', '/portal-catalog/exceptions-spreadsheet', DsRequest.getHost(env, 'micro'), body);
    }
}
