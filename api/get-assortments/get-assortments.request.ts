import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface Assortment {
    name: string;
    id: string;
    status: 'active' | 'deleted';
    isDynamic?: boolean;
}

export interface GetAssortmentsResponse extends DsResponse {
    assortments: Assortment[];
}

/**
 * Returns the list of assortments for the logged in account
 */
export class GetAssortmentsRequest extends DsRequest<null, GetAssortmentsResponse, DsError> {
    constructor(env: DscoEnv) {
        super('GET', '/portal-catalog/assortments', DsRequest.getHost(env, 'micro'), null);
    }
}
