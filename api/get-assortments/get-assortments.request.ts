import { DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface Assortment {
    name: string;
    id: string;
    status: 'active' | 'deleted';
}

export interface GetAssortmentsResponse extends DsResponse {
    assortments: Assortment[];
}

export class GetAssortmentsRequest extends DsRequest<null, GetAssortmentsResponse, DsError> {
    constructor(env: DscoEnv) {
        super('GET', '/portal-catalog/assortments', DsRequest.getHost(env, 'micro'), null);
    }
}
