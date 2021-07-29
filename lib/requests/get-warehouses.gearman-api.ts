import { GearmanApi } from '@dsco/gearman-apis';
import { DsError, DsResponse } from '@dsco/ts-models';

export interface GetWarehousesGearmanRequest {
    actor: {
        accountId: string;
    };
}

export interface GetWarehousesGearmanResponse extends DsResponse {
    warehouses: Array<TinyWarehouse>;
}

// TODO: Fully type this and add to @dsco/ts-models
export interface TinyWarehouse {
    warehouseId: string;
    code: string;
}

export class GetWarehousesGearmanApi extends GearmanApi<
    GetWarehousesGearmanRequest,
    GetWarehousesGearmanResponse,
    DsError
> {
    protected readonly body: GetWarehousesGearmanRequest;
    protected readonly endpoint = 'Service.AccountSettings';
    protected readonly requestType = 'getWarehouses';

    constructor(accountId: string) {
        super();
        this.body = {
            actor: {
                accountId,
            },
        };
    }
}
