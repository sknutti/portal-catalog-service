import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';

export interface ItemExceptionSearchBodyV1 {
    supplierId: number;
    channelId: number;
    categoryPath: string;
    version: 1;
}

export interface ItemExceptionSearchV1Response extends DsResponse {
    items: CoreCatalog[];
    config: any; // an object, echoes header information back
    // data: {
    //     items: CoreCatalog[]; // Not sure why it isn't Item[];
    //     duration: number;
    //     success: boolean;
    // };
    headers: any; // an object, details about the execution such as datetime and connection status
    request: any; // cannot check this value with JSON.stringify...
    status: number; // http status, so should usually be 200
    statusText: string; // http status, if status is 200, this is 'OK'
}

export class ItemExceptionSearchV1Request extends DsRequest<
    ItemExceptionSearchBodyV1,
    ItemExceptionSearchV1Response,
    DsError
> {
    constructor(env: DscoEnv, body: ItemExceptionSearchBodyV1) {
        super('POST', '/item/api/item/exceptions', DsRequest.getHost(env, 'apps'), body);
    }
}
