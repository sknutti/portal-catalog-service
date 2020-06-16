import { AttributionCategoryAttribute, DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GetCategorySpreadsheetResponse extends DsResponse {
	url: string;
}
export interface GenerateCategorySpreadsheetRequestBody {
    retailerId: number;
    attrPath: string;
}

export class GenerateCategorySpreadsheetRequest extends DsRequest<GenerateCategorySpreadsheetRequestBody, GetCategorySpreadsheetResponse, DsError> {
	constructor(env: DscoEnv, public retailerId: number, public attrPath: string) {
        super('POST', '/portal-catalog/spreadsheet', DsRequest.getHost(env, 'micro'), {retailerId, attrPath});
    }
}
