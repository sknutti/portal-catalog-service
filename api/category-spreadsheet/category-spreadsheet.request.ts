import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface CategorySpreadsheetRequestBody {
    retailerId: number;
    categoryPath: string;

    /**
     * Should only be specified when action is 'update'
     * Updates the spreadsheet without copying unsaved changes.
     */
    revert?: boolean;

    /**
     * Should only be specified when action is 'update'
     * Updates the spreadsheet, overwriting any data with data in the xlsx spreadsheet
     */
    xlsxSheetBase64?: string;
}

export class CategorySpreadsheetRequest extends DsRequest<CategorySpreadsheetRequestBody, DsResponse, DsError> {
	constructor(env: DscoEnv, public action: 'generate' | 'publish' | 'update', body: CategorySpreadsheetRequestBody) {
        super('POST', `/portal-catalog/spreadsheet${action === 'generate' ? '' : `/${action}`}`, DsRequest.getHost(env, 'micro'), body);
    }
}
