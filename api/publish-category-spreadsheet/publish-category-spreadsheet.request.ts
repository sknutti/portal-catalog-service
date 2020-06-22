import { DscoEnv, DsError, DsRequest, DsResponse, ValidationMessage } from '@dsco/ts-models';

export interface PublishCategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
}

export interface PublishCategorySpreadsheetResponse extends DsResponse {
    validationMessages: ValidationMessage[];
}

export class PublishCategorySpreadsheetRequest extends DsRequest<PublishCategorySpreadsheetRequestBody, PublishCategorySpreadsheetResponse, DsError> {
	constructor(env: DscoEnv, public retailerId: number, public categoryPath: string) {
        super('POST', '/portal-catalog/spreadsheet/publish', DsRequest.getHost(env, 'micro'), {retailerId, categoryPath});
    }
}
