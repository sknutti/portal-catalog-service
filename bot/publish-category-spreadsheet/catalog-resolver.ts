import { CoreCatalog } from '@lib/core-catalog';
import {
    CreateOrUpdateItemBulkGearmanApi,
    CreateOrUpdateItemMessage,
} from '@lib/requests/create-or-update-item-bulk.gearman-api';
import { DscoCatalogRow } from '@lib/spreadsheet';

export class CatalogResolver {
    /**
     * Sets supplierId and userId
     */
    constructor(private supplierId: number, private userId: number) {}

    /**
     * Resolves any errors
     */
    async resolveBatch(
        rows: IterableIterator<[row: DscoCatalogRow, rowIdx: number]>,
        callId: string,
    ): Promise<CatalogResolveError | undefined> {
        const indexMap: Record<number, number> = {};
        const catalogs: CoreCatalog[] = [];

        let i = 0;
        for (const [row, rowIdx] of rows) {
            indexMap[i] = rowIdx;
            catalogs.push(row.catalog);

            i++;
        }

        const api = new CreateOrUpdateItemBulkGearmanApi(this.supplierId, this.userId.toString(10), catalogs);
        (api.body as any).call_id = callId;

        const gmResp = await api.submit();

        i = 0;
        if (!gmResp.success && !gmResp.data?.responses?.length) {
            return {
                messages: [`Unexpected validation error. EID: ${callId}`, gmResp.reason],
                rowIdx: indexMap[i],
                sentRequest: api.body,
            };
        }

        for (const response of gmResp.data?.responses || []) {
            if (!response.success) {
                return {
                    messages: this.findErrors(response.data?.messages || []),
                    rowIdx: indexMap[i],
                    sentRequest: api.body,
                };
            }

            i++;
        }
    }

    /**
     * Handles any errors in the gearman response, returning true if there was an error
     */
    private findErrors(messages: CreateOrUpdateItemMessage[]): string[] {
        let errors = messages.filter((m) => m.type === 'error' || m.type === 'ERROR') || [];

        if (!errors.length) {
            errors =
                messages.filter(
                    (m) =>
                        m.type === 'RECORD_STATUS_MESSAGE' || m.type === 'RECORD_STATUS' || m.type === 'STATUS_MESSAGE',
                ) || [];
        }

        if (errors.length) {
            return Array.from(new Set(errors.map((e) => e.message)));
        } else {
            return ['Unable to save item.'];
        }
    }
}

/**
 * Error from resolving the catalog
 */
interface CatalogResolveError {
    rowIdx: number;
    messages: string[];
    sentRequest: CreateOrUpdateItemBulkGearmanApi['body'];
}
