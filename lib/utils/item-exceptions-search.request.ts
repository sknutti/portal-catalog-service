import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';

export interface ItemExceptionSearchBody {
    supplierId: number;
    channelId: number;
    categoryPath: string;
    version: 1;
    pageSize?: number;
    paginationKey?: null | number[];
}

export interface ItemExceptionSearchResponse extends DsResponse {
    items: CoreCatalog[];
    config: any; // an object, echoes header information back
    headers: any; // an object, details about the execution such as datetime and connection status
    request: any; // cannot check this value with JSON.stringify...
    status: number; // http status, so should usually be 200
    statusText: string; // http status, if status is 200, this is 'OK'
}

export class ItemExceptionSearchRequest extends DsRequest<
    ItemExceptionSearchBody,
    ItemExceptionSearchResponse,
    DsError
> {
    constructor(env: DscoEnv, body: ItemExceptionSearchBody) {
        super('POST', '/item/api/exceptions', DsRequest.getHost(env, 'apps'), body);
    }
}
