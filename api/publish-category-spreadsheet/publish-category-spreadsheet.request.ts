import { DscoEnv, DsError, DsRequest, DsResponse, ValidationMessage, XrayActionSeverity } from '@dsco/ts-models';

export interface SpreadsheetRowMessage extends Partial<ValidationMessage> {
    message: string;
    messageType: XrayActionSeverity;
}

export interface PublishCategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
    /**
     * Should be a binary string containing the gzipped file
     */
    gzippedFile: string;
    startRowIdx?: number;
}

export interface PublishCategorySpreadsheetResponse extends DsResponse {
    numSuccessfulRows: number;
    numEmptyRows: number;
    rowWithError?: number;
    validationMessages?: SpreadsheetRowMessage[];
}

export class PublishCategorySpreadsheetRequest extends DsRequest<PublishCategorySpreadsheetRequestBody, PublishCategorySpreadsheetResponse, DsError> {
    constructor(env: DscoEnv, body: PublishCategorySpreadsheetRequestBody) {
        super('POST', '/portal-catalog/spreadsheet/publish', DsRequest.getHost(env, 'micro'), body);
    }
}
