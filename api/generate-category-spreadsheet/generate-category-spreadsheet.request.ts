import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GenerateCategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
}

export interface GenerateCategorySpreadsheetResponse extends DsResponse {
    /**
     * A binary string containing the gzipped file
     */
    gzippedFile: string;
}

export class GenerateCategorySpreadsheetRequest extends DsRequest<
    GenerateCategorySpreadsheetRequestBody,
    GenerateCategorySpreadsheetResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GenerateCategorySpreadsheetRequestBody) {
        super('POST', '/portal-catalog/spreadsheet', DsRequest.getHost(env, 'micro'), body);
    }
}
