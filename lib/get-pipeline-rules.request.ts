import { DscoEnv, DsRequest, DsResponse, PipelineRule, UnexpectedError } from '@dsco/ts-models';

export interface GetPipelineRulesResponse extends DsResponse {
  rules: PipelineRule[];
  dsco?: PipelineRule[];
  partners?: Record<string, PipelineRule[]>;
}

export class GetPipelineRulesRequest extends DsRequest<null, GetPipelineRulesResponse, UnexpectedError> {
  constructor(env: DscoEnv) {
    super(
      'GET',
      '/pipeline/api/rules',
      DsRequest.getHost(env, 'micro'),
      null
    );
  }
}
