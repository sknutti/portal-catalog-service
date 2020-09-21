import { GetWarehousesGearmanApi, TinyWarehouse } from '@lib/requests';

const warehouses: Map<number, Promise<TinyWarehouse[]>> = new Map();

/**
 * Super simple helper for caching loaded warehouses
 */
export class WarehousesLoader {
    static loadWarehouses(supplierId: number): Promise<TinyWarehouse[]> {
        let value = warehouses.get(supplierId);

        if (!value) {
            value = this.loadFromGearman(supplierId);
            warehouses.set(supplierId, value);
        }

        return value;
    }

    private static async loadFromGearman(supplierId: number): Promise<TinyWarehouse[]> {
        const resp = await new GetWarehousesGearmanApi(supplierId.toString()).submit();

        if (resp.success) {
            return resp.warehouses;
        } else {
            throw new Error(`Unable to load warehouses for supplierId: ${supplierId}`);
        }
    }
}
