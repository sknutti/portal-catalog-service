import { DscoEnv, DsError, DsRequest, DsResponse, ValidationMessage, XrayActionSeverity } from '@dsco/ts-models';

export interface PublishCategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
}

export interface PublishCategorySpreadsheetResponse extends DsResponse {
    rowMessages: { [row: number]: SpreadsheetRowMessage[] };
}

export interface SpreadsheetRowMessage extends Partial<ValidationMessage> {
    message: string;
    messageType: XrayActionSeverity;
}

export class PublishCategorySpreadsheetRequest extends DsRequest<PublishCategorySpreadsheetRequestBody, PublishCategorySpreadsheetResponse, DsError> {
	constructor(env: DscoEnv, public retailerId: number, public categoryPath: string) {
        super('POST', '/portal-catalog/spreadsheet/publish', DsRequest.getHost(env, 'micro'), {retailerId, categoryPath});
    }
}
