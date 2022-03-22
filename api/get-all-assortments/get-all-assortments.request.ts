import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';
import { Assortment } from '..';

export interface GetAllAssortmentsRequestBody {
    account_ids: number[];
}

export interface GetAllAssortmentsResponse extends DsResponse {
    assortments: Assortment[];
}

/**
 * Returns the list of all assortments for the passed in accounts
 */
export class GetAllAssortmentsRequest extends DsRequest<
    GetAllAssortmentsRequestBody,
    GetAllAssortmentsResponse,
    DsError
> {
    constructor(env: DscoEnv, body: GetAllAssortmentsRequestBody) {
        super('POST', '/portal-catalog/all-assortments', DsRequest.getHost(env, 'micro'), body);
    }
}
