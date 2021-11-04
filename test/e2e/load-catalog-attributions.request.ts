import { CatalogAttribution, DscoEnv, DsError, DsRequest, DsResponse } from '@dsco/ts-models';

export interface LoadCatalogAttributionsResponse extends DsResponse {
    attributions: CatalogAttribution[];
}

export class LoadCatalogAttributionsRequest extends DsRequest<null, LoadCatalogAttributionsResponse, DsError> {
    constructor(env: DscoEnv, accountId: number) {
        super('GET', `/catalog-attribution/catalog/catalogs?accountId=${accountId}`, DsRequest.getHost(env, 'apps'), null);
    }
}
