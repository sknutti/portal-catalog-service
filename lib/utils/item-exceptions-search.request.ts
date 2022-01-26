import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';

export interface ItemExceptionSearchBody<FULL_DETAIL extends boolean = true> {
    supplierId: number;
    channelId: number;
    categoryPath: string;
    version: 1;
    pageSize?: number;
    paginationKey?: null | number[];
    fullDetail?: FULL_DETAIL;
}

interface ItemExceptionSearchResponseTotal {
    value: number;
    relation: string;
}
//TODO: This should be imported to match item/api/exception response
export interface ItemExceptionSearchResponse<FULL_DETAIL extends boolean = true> extends DsResponse {
    items: FULL_DETAIL extends true ? CoreCatalog[] : number[];
    duration: number;
    returned: number;
    total: ItemExceptionSearchResponseTotal;
    paginationKey: number[];
    pageSize: number;
    hitRange: any;
    pageNumber?: number;
}

export class ItemExceptionSearchRequest<FULL_DETAIL extends boolean = true> extends DsRequest<
    ItemExceptionSearchBody<FULL_DETAIL>,
    ItemExceptionSearchResponse<FULL_DETAIL>,
    DsError
> {
    constructor(env: DscoEnv, body: ItemExceptionSearchBody<FULL_DETAIL>) {
        super('POST', '/item/api/exceptions', DsRequest.getHost(env, 'apps'), body);
    }
}
