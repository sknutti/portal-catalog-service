/* eslint @typescript-eslint/naming-convention: 0, camelcase: 0 */
import { GearmanApi } from '@dsco/gearman-apis';
import { DsError, DsResponse } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';

export interface CreateOrUpdateItemBulkGearmanApiRequest {
    params: {
        account_id: number;
        user_id: string;
        data_type: string;
        from_portal: boolean;
        items: CoreCatalog[];
    };
}

export interface CreateOrUpdateItemBulkGearmanApiResponse {
    response_type: string;
    data?: {
        action: string;
        message: string;

        responses: ItemResponse[];
    };
}

export interface ItemResponse {
    success: boolean;
    data?: {
        action: string;
        message: string;
        messages?: CreateOrUpdateItemMessage[];
    };
}

export interface CreateOrUpdateItemMessage {
    type:
        | 'ERROR'
        | 'error'
        | 'WARNING'
        | 'warning'
        | 'INFO'
        | 'info'
        | 'RECORD_STATUS'
        | 'STATUS_MESSAGE'
        | 'STATUS'
        | 'RECORD_INFO'
        | 'RECORD_STATUS_MESSAGE';
    message: string;
}

export class CreateOrUpdateItemBulkGearmanApi extends GearmanApi<
    CreateOrUpdateItemBulkGearmanApiRequest,
    CreateOrUpdateItemBulkGearmanApiResponse & DsResponse,
    CreateOrUpdateItemBulkGearmanApiResponse & DsError
> {
    protected readonly endpoint = 'Operation';
    protected readonly requestType = 'PublicApiCreateOrUpdateItemBulk';

    body: CreateOrUpdateItemBulkGearmanApiRequest;

    constructor(account_id: number, user_id: string, items: CoreCatalog[]) {
        super(false, false);

        this.body = {
            params: {
                account_id,
                user_id,
                items,
                data_type: 'Catalog',
                from_portal: true,
            },
        };
    }
}
