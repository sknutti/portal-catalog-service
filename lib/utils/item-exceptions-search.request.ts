import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';

export interface ItemExceptionSearchBody {
    supplierId: number;
    channelId: number;
    categoryPath: string;
    version: 1;
    pageSize?: number;
    paginationKey?: null | number[];
    fullDetail?: boolean;
}

interface ItemExceptionSearchResponseTotal {
    value: number;
    relation: string;
}
//TODO: This should be imported to match item/api/exception response
export interface ItemExceptionSearchResponse extends DsResponse {
    items: CoreCatalog[] | number[];
    duration: number;
    returned: number;
    total: ItemExceptionSearchResponseTotal;
    paginationKey: number[];
    pageSize: number;
    hitRange: any;
    pageNumber?: number;
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
