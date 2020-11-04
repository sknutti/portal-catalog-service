import { DscoEnv, DsRequest, DsResponse, PipelineRule, UnexpectedError } from '@dsco/ts-models';

export interface GetPipelineRulesResponse extends DsResponse {
  rules: PipelineRule[];
  dsco?: PipelineRule[];
  partners?: Record<string, PipelineRule[]>;
}

export class GetPipelineRulesRequest extends DsRequest<null, GetPipelineRulesResponse, UnexpectedError> {
  constructor(env: DscoEnv, accountId: number) {
    super(
      'GET',
      `/pipeline/api/rules?accountId=${accountId}`,
      DsRequest.getHost(env, 'micro'),
      null
    );
  }
}
