import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GetCategorySpreadsheetResponse extends DsResponse {
	url: string;
}
export interface GenerateCategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;
}

export class GenerateCategorySpreadsheetRequest extends DsRequest<GenerateCategorySpreadsheetRequestBody, GetCategorySpreadsheetResponse, DsError> {
	constructor(env: DscoEnv, public retailerId: number, public categoryPath: string) {
        super('POST', '/portal-catalog/spreadsheet', DsRequest.getHost(env, 'micro'), {retailerId, categoryPath});
    }
}
