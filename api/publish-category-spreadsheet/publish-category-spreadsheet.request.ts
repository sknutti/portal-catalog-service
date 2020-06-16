import { AttributionCategoryAttribute, DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface GetCategorySpreadsheetResponse extends DsResponse {
	url: string;
}
export interface PublishCategorySpreadsheetRequestBody {
    spreadsheetUrl: string;
    // TODO: These attributes shouldn't be hardcoded
    attributes: AttributionCategoryAttribute[];
}

export class PublishCategorySpreadsheetRequest extends DsRequest<PublishCategorySpreadsheetRequestBody, GetCategorySpreadsheetResponse, DsError> {
	constructor(env: DscoEnv, public spreadsheetUrl: string, public attributes: AttributionCategoryAttribute[]) {
        super('POST', '/portal-catalog/spreadsheet/publish', DsRequest.getHost(env, 'micro'), {spreadsheetUrl, attributes});
    }
}
