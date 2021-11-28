import { axiosRequest } from '@dsco/aws-auth';
import { getAwsRegion, getDscoEnv } from '@lib/environment';
import { LoadCatalogAttributionsRequest } from '@lib/requests';
import { getApiCredentials } from '@lib/utils';

export * from './test-aws-creds';
export * from './local-invocations';
export * from './test-accounts';

export async function getTopLevelCategoryNames(retailerId: number): Promise<string[]> {
    const resp = await axiosRequest(
        new LoadCatalogAttributionsRequest(getDscoEnv(), retailerId),
        getDscoEnv(),
        getApiCredentials(),
        getAwsRegion(),
    );

    if (!resp.data.success) {
        throw new Error('Failed loading catalog attributions');
    }

    const activeAttribution = resp.data.attributions.find((attr) => attr.active);
    if (!activeAttribution) {
        throw new Error(`Retailer ${retailerId} has no active catalog attribution`);
    }

    return Object.values(activeAttribution.children || {}).map((c) => c.path);
}
