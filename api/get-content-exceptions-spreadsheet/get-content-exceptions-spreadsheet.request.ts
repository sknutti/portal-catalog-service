import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GenerateContentExceptionsSpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
}

export interface GenerateContentExceptionsSpreadsheetResponse extends DsResponse {
    /**
     * A binary string containing the gzipped file
     */
    gzippedFile: string;
}

/**
 * Generates an xlsx spreadsheet for exceptions in a given catalog attribution category
 */
export class GenerateContentExceptionsSpreadsheetRequest extends DsRequest<
    GenerateContentExceptionsSpreadsheetRequestBody,
    GenerateContentExceptionsSpreadsheetResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GenerateContentExceptionsSpreadsheetRequestBody) {
        super('POST', '/content/get-exceptions-spreadsheet', DsRequest.getHost(env, 'micro'), body);
    }
}
