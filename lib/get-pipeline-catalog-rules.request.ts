import { DscoEnv, DsRequest, DsResponse, PipelineRule, UnexpectedError } from '@dsco/ts-models';

export interface GetPipelineCatalogRulesRequestBody {
  paths: string[];
  accountId: string;
}

export interface GetPipelineCatalogRulesResponse extends DsResponse {
  rules: PipelineRule[];
}

export class GetPipelineCatalogRulesRequest extends DsRequest<GetPipelineCatalogRulesRequestBody, GetPipelineCatalogRulesResponse, UnexpectedError> {
  constructor(env: DscoEnv, public paths: string[], public accountId: string) {
    super(
      'POST',
      '/pipeline/api/rules/catalog',
      DsRequest.getHost(env, 'micro'),
      {paths, accountId}
    );
  }
}
