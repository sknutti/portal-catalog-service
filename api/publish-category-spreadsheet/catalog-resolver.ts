import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { ValidationMessage, XrayActionSeverity } from '@dsco/ts-models';
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

        const gearmanResponse = await new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: this.supplierId.toString(10),
                user_id: this.userId.toString(10)
            },
            params: row.catalog
        }).submit();

        const errors = this.findErrors(gearmanResponse);

        return errors.length ? errors : 'success';
    }

    /**
     * Handles any errors in the gearman response, returning true if there was an error
     */
    private findErrors(response: ResolveExceptionGearmanApiResponse): SpreadsheetRowMessage[] {
        const result: SpreadsheetRowMessage[] = [];

        const hasError = !gearmanActionSuccess.has(response.action);

        let hasErrorMessage = false;

        for (const msg of response.validation_messages || []) {
            // TODO: We want all validation messages here, but are only flowing errors because of AWS message size limit
            // @see https://dsco.atlassian.net/browse/ES-857
            if (msg.messageType === XrayActionSeverity.error) {
                result.push(msg);
                hasErrorMessage = true;
            }
        }

        if (hasError && !hasErrorMessage) {
            const messages = response.messages?.length ? response.messages : ['Unable to save item.'];

            for (const message of messages) {
                result.push({message, messageType: XrayActionSeverity.error});
            }
        }

        return result;
    }
}

type CatalogResolveResponse = 'empty' | 'success' | SpreadsheetRowMessage[];
