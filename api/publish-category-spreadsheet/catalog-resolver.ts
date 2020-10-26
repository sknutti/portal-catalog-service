import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { ValidationMessage, XrayActionSeverity } from '@dsco/ts-models';
import {
    CreateOrUpdateItemGearmanApi,
    CreateOrUpdateItemGearmanApiResponse
} from '@lib/requests/create-or-update-item.gearman-api';
import { DscoCatalogRow } from '@lib/spreadsheet';
import { SpreadsheetRowMessage } from '../../api';

const gearmanActionSuccess: Set<string> = new Set([
    'SAVED',
    'CREATED',
    'UPDATED',
    'SUCCESS'
]);

export class CatalogResolver {

    constructor(private supplierId: number, private userId: number) {
    }


    async resolveCatalogRow(row: DscoCatalogRow): Promise<CatalogResolveResponse> {
        if (row.emptyRow) {
            return 'empty';
        }

        // TODO: Use the bulk upload api
        const gearmanResponse = await new CreateOrUpdateItemGearmanApi(this.supplierId, this.userId.toString(10), row.catalog).submit();

        return gearmanResponse.success ? 'success' : this.findErrors(gearmanResponse);
    }

    /**
     * Handles any errors in the gearman response, returning true if there was an error
     */
    private findErrors(response: CreateOrUpdateItemGearmanApiResponse & {success: boolean}): string[] {
        let errors = response.data?.messages?.filter(m => m.type === 'ERROR') || [];

        if (!errors.length) {
           errors = response.data?.messages?.filter(m => m.type === 'RECORD_STATUS_MESSAGE') || [];
        }

        if (errors.length) {
            return errors.map(e => e.message);
        } else {
            return ['Unable to save item.'];
        }
    }
}

type CatalogResolveResponse = 'empty' | 'success' | string[];
