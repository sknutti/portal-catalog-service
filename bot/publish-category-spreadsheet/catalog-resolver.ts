import { ResolveExceptionGearmanApi, ResolveExceptionGearmanApiResponse } from '@dsco/gearman-apis';
import { DsError, keyBy, ProductStatus, XrayActionSeverity } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { GetWarehousesGearmanApi, GetWarehousesGearmanResponse, TinyWarehouse } from '@lib/requests';
import { DscoCatalogRow } from '@lib/spreadsheet';
import { sendWebsocketEvent } from '@lib/utils';
import { SpreadsheetRowMessage } from '../../api';

const THROTTLE_TIME = 300;
const gearmanActionSuccess: Set<string> = new Set([
    'SAVED',
    'CREATED',
    'UPDATED',
    'SUCCESS'
]);

export class CatalogResolver {
    /**
     * This will be filled with any errors found while resolving
     */
    rowMessages: Record<number, SpreadsheetRowMessage[]> = {};
    numSuccessfulRows = 0;
    numFailedRows = 0;
    numEmptyRows = 0;
    rowIdxsWithErrors: number[] = [];

    private warehousesPromise?: Promise<GetWarehousesGearmanResponse | DsError>;

    private existingItems: Record<string, CoreCatalog>;

    /**
     * The number of rows that were modified that have been processed.  Used to give a progress report.
     */
    private numProcessedRows = 0;

    /**
     * The number of rows that were modified that need to be processed.  Used to give a progress report.
     */
    private numRowsToProcess: number;

    /**
     * Keeps track of when we last sen't a progress report, used to throttle progress updates.
     */
    private lastSendTime = 0;

    private warehouses?: TinyWarehouse[];

    constructor(
      private rows: DscoCatalogRow[],
      existingItems: CoreCatalog[],
      private userId: number,
      private supplierId: number,
      private categoryPath: string,
      private fromPct: number,
      private toPct: number
    ) {
        this.existingItems = keyBy(existingItems, 'sku');
        this.numRowsToProcess = rows.filter(row => row.modified).length;
    }

    resolveCatalogsWithProgress(): Promise<CatalogResolveRecord[]> {
        return Promise.all(this.rows.map((row, index) => this.resolveCatalog(row, index + 1))); // +1 for the header row
    }


    private async resolveCatalog(row: DscoCatalogRow, rowIdx: number): Promise<CatalogResolveRecord> {
        let response: ResolveExceptionGearmanApiResponse | undefined;
        let hasError = false;

        if (row.modified) {
            if (row.emptyRow) {
                this.numEmptyRows++;
            } else  { // Try to save all rows that aren't empty
                response = await this.resolveModifiedCatalog(row);
                hasError = this.hasError(response, rowIdx);
            }

            this.numProcessedRows++;
            const now = Date.now();

            // Send a progress report if the row has been modified
            if (now - this.lastSendTime > THROTTLE_TIME) {
                this.lastSendTime = now;
                await sendWebsocketEvent('publishCatalogSpreadsheetProgress', {
                    categoryPath: this.categoryPath,
                    progress: this.fromPct + ((this.toPct - this.fromPct) * (this.numProcessedRows / this.numRowsToProcess)),
                    message: `Validating & saving rows ${this.numProcessedRows}/${this.numRowsToProcess}...`
                }, this.supplierId);
            }
        }

        return {response, rowIdx, hasError, row, existingSku: !!row.catalog.sku && row.catalog.sku in this.existingItems};
    }

    private async resolveModifiedCatalog(row: DscoCatalogRow): Promise<ResolveExceptionGearmanApiResponse> {
        const {catalog} = row;

        // Any product status other than pending requires both quantity_available and warehouses quantity.  This gives defaults of zero to both
        if (catalog.product_status !== ProductStatus.PENDING) {
            const existingItem = this.existingItems[catalog.sku!];
            catalog.quantity_available = existingItem?.quantity_available || 0;

            if (!this.warehouses) {
                this.warehousesPromise = this.warehousesPromise || new GetWarehousesGearmanApi(this.supplierId.toString()).submit();
                const resp = await this.warehousesPromise;
                this.warehouses = resp.success ? resp.warehouses : [];
            }

            this.handleWarehouseQuantity(catalog, existingItem);
        }

        return new ResolveExceptionGearmanApi('CreateOrUpdateCatalogItem', {
            caller: {
                account_id: this.supplierId.toString(10),
                user_id: this.userId.toString(10)
            },
            params: catalog
        }).submit();
    }

    private handleWarehouseQuantity(item: CoreCatalog, existing?: CoreCatalog): void {
        const existingWarehouses = new Set<string>();
        const newWarehouses = item.warehouses = item.warehouses || [];

        for (const existingWarehouse of existing?.warehouses || []) {
            if (!existingWarehouse) {
                continue;
            }

            existingWarehouses.add(existingWarehouse.warehouse_id);
            newWarehouses.push(existingWarehouse);
            if (!existingWarehouse.quantity) {
                existingWarehouse.quantity = 0;
            }
        }

        // This function must be called after we know we have loaded warehouses
        for (const warehouse of this.warehouses!) {
            if (existingWarehouses.has(warehouse.warehouseId)) {
                continue;
            }

            existingWarehouses.add(warehouse.warehouseId);
            newWarehouses.push({
                quantity: 0,
                warehouse_id: warehouse.warehouseId,
                code: warehouse.code
            });
        }
    }

    private addRowMessage(row: number, message: SpreadsheetRowMessage) {
        let messages = this.rowMessages[row];
        if (!messages) {
            messages = this.rowMessages[row] = [];
        }
        messages.push(message);
    }

    /**
     * Handles any errors in the gearman response, returning true if there was an error
     */
    private hasError(response: ResolveExceptionGearmanApiResponse, rowIdx: number): boolean {
        const hasError = !gearmanActionSuccess.has(response.action);

        let hasErrorMessage = false;

        for (const msg of response.validation_messages || []) {
            this.addRowMessage(rowIdx + 1, msg);
            hasErrorMessage = hasErrorMessage || msg.messageType === XrayActionSeverity.error;
        }

        if (hasError && !hasErrorMessage) {
            const messages = response.messages?.length ? response.messages : ['Unable to save item.'];

            for (const message of messages) {
                this.addRowMessage(rowIdx + 1, {message, messageType: XrayActionSeverity.error});
            }
        }

        if (hasError) {
            this.numFailedRows++;
            this.rowIdxsWithErrors.push(rowIdx);
        } else {
            this.numSuccessfulRows++;
        }

        return hasError;
    }
}


interface CatalogResolveRecord {
    row: DscoCatalogRow;
    rowIdx: number;
    hasError: boolean;
    existingSku: boolean;
    response?: ResolveExceptionGearmanApiResponse;
}
