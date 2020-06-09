import { AttributionCategoryAttribute, DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GetCategorySpreadsheetResponse extends DsResponse {
	url: string;
}
export interface GenerateCategorySpreadsheetRequestBody {
    attributes: AttributionCategoryAttribute[];
}

export class GenerateCategorySpreadsheetRequest extends DsRequest<GenerateCategorySpreadsheetRequestBody, GetCategorySpreadsheetResponse, DsError> {
	constructor(env: DscoEnv, public attributes: AttributionCategoryAttribute[]) {
        super('POST', '/portal-category/spreadsheet', DsRequest.getHost(env, 'micro'), {attributes});
    }
}
