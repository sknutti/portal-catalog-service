import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface CategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;

    /**
     * Should only be specified when action is 'update'
     * Updates the spreadsheet without copying unsaved changes.
     */
    revert?: boolean;
}

export class CategorySpreadsheetRequest extends DsRequest<CategorySpreadsheetRequestBody, DsResponse, DsError> {
	constructor(env: DscoEnv, public retailerId: number, public categoryPath: string, public action: 'generate' | 'publish' | 'update') {
        super('POST', `/portal-catalog/spreadsheet${action === 'generate' ? '' : `/${action}`}`, DsRequest.getHost(env, 'micro'), {retailerId, categoryPath});
    }
}
