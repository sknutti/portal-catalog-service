/* eslint @typescript-eslint/naming-convention: 0, camelcase: 0 */
import { GearmanApi } from '@dsco/gearman-apis';
import { AccountType, DsError, DsResponse } from '@dsco/ts-models';

export interface GetAssortmentsGearmanRequest {
    caller: {
        account_id: string;
        account_type: AccountType;
        user_id: string;
    };
    params?: {
        fresh?: boolean;
        include_deleted?: boolean;
        account_ids?: string[];
    };
}

export interface GetAssortmentsGearmanResponse extends DsResponse {
    assortments: Array<{
        name: string;
        id: string;
        status: 'active' | 'deleted';
    }>;
}

export class GetAssortmentsGearmanApi extends GearmanApi<
    GetAssortmentsGearmanRequest,
    GetAssortmentsGearmanResponse,
    DsError
> {
    protected readonly body: GetAssortmentsGearmanRequest;
    protected readonly endpoint = 'Service.Assortment';
    protected readonly requestType = 'GetList';

    constructor(caller: GetAssortmentsGearmanRequest['caller'], params?: GetAssortmentsGearmanRequest['params']) {
        super();
        this.body = { caller, params };
    }
}
