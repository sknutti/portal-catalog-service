/**
 * Copied from angular-frontend
 * File: libs/apis/requests/item-exception-summary.request.ts
 */

import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

interface ItemExceptionSummaryBody {
    retailerId?: number;
    supplierId?: number;
}

interface ItemExceptionCount {
    channelId: string;
    categoryPath: string;
    count: number;
    [key: string]: any;
}

interface ItemExceptionSummaryResponse extends DsResponse {
    exceptionCounts: Array<ItemExceptionCount>;
    duration: number; // ms
}

export interface ItemExceptionCountPrompt {
    name: string;
    value: string;
}

export class ItemExceptionSummaryRequest extends DsRequest<
    ItemExceptionSummaryBody,
    ItemExceptionSummaryResponse,
    DsError
> {
    constructor(env: DscoEnv, body: ItemExceptionSummaryBody) {
        super('POST', '/item/api/exceptions/summary', DsRequest.getHost(env, 'apps'), body);
    }
}
