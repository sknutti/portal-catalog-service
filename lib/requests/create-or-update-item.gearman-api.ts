import { GearmanApi } from '@dsco/gearman-apis';
import { DsError, DsResponse } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';

export interface CreateOrUpdateItemGearmanApiRequest {
    params: CoreCatalog & {
        account_id: number;
        user_id: string;
        data_type: string;
        from_portal: boolean;
    }
}

export interface CreateOrUpdateItemGearmanApiResponse {
    response_type: string;
    data?: {
        action: string;
        message: string;
        messages: {
            type: 'ERROR' | 'WARNING' | 'INFO' | 'RECORD_STATUS' | 'RECORD_INFO' | 'RECORD_STATUS_MESSAGE',
            message: string
        }[]
    }
}


export class CreateOrUpdateItemGearmanApi extends GearmanApi<CreateOrUpdateItemGearmanApiRequest,
    CreateOrUpdateItemGearmanApiResponse & DsResponse,
    CreateOrUpdateItemGearmanApiResponse & DsError> {

    protected readonly endpoint = 'Operation';
    protected readonly requestType = 'PublicApiCreateOrUpdateItem';

    body: CreateOrUpdateItemGearmanApiRequest;

    constructor(account_id: number, user_id: string, coreCatalog: CoreCatalog) {
        super(false, false);

        this.body = {
            params: coreCatalog as CreateOrUpdateItemGearmanApiRequest['params']
        };
        this.body.params.account_id = account_id;
        this.body.params.user_id = user_id;
        this.body.params.data_type = 'Catalog';
        this.body.params.from_portal = true;
    }
}
