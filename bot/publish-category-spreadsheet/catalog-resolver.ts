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

        const api = new CreateOrUpdateItemBulkGearmanApi(this.supplierId, this.userId.toString(10), catalogs);
        const responses = await api.submit();

        i = 0;
        for (const response of responses.data?.responses || []) {
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
