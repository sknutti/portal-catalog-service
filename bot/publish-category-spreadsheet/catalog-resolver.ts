import { CoreCatalog } from '@lib/core-catalog';
import {
    CreateOrUpdateItemBulkGearmanApi,
    CreateOrUpdateItemMessage
} from '@lib/requests/create-or-update-item-bulk.gearman-api';
import { DscoCatalogRow } from '@lib/spreadsheet';

export class CatalogResolver {

    constructor(private supplierId: number, private userId: number) {
    }

    async resolveBatch(rows: IterableIterator<[row: DscoCatalogRow, rowIdx: number]>): Promise<CatalogResolveError | undefined> {
        const indexMap: Record<number, number> = {};
        const catalogs: CoreCatalog[] = [];

        let i = 0;
        for (const [row, rowIdx] of rows) {
            indexMap[i] = rowIdx;
            catalogs.push(row.catalog);

            i++;
        }

        const callId = Math.random().toString(36).substring(6).toUpperCase();
        const api = new CreateOrUpdateItemBulkGearmanApi(this.supplierId, this.userId.toString(10), catalogs);
        (api.body as any).call_id = callId;

        const gmResp = await api.submit();

        i = 0;
        if (!gmResp.success && !gmResp.data?.responses?.length) {
            console.error(`
Got bad gearman response: ${callId}

REQUEST for ${callId}: --------------
${JSON.stringify(api.body)}

RESPONSE for ${callId}: -------------
${JSON.stringify(gmResp)}`);

            return {
                messages: [`Unexpected validation error. EID: ${callId}`, gmResp.reason],
                rowIdx: indexMap[i]
            };
        }

        for (const response of gmResp.data?.responses || []) {
            if (!response.success) {
                return {
                    messages: this.findErrors(response.data?.messages || []),
                    rowIdx: indexMap[i]
                };
            }

            i++;
        }
    }

    /**
     * Handles any errors in the gearman response, returning true if there was an error
     */
    private findErrors(messages: CreateOrUpdateItemMessage[]): string[] {
        let errors = messages.filter(m => m.type === 'error' || m.type === 'ERROR') || [];

        if (!errors.length) {
           errors = messages.filter(m => m.type === 'RECORD_STATUS_MESSAGE') || [];
        }

        if (errors.length) {
            return Array.from(new Set(errors.map(e => e.message)));
        } else {
            return ['Unable to save item.'];
        }
    }
}

interface CatalogResolveError {
    rowIdx: number;
    messages: string[];
}
