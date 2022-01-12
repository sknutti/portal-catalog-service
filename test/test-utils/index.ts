import { axiosRequest } from '@dsco/aws-auth';
import { getAwsRegion, getDscoEnv } from '@lib/environment';
import { LoadCatalogAttributionsRequest } from '@lib/requests';
import { getApiCredentials } from '@lib/utils';
import { ItemExceptionCountPrompt, ItemExceptionSummaryRequest } from './item-exception-summary';

export * from './test-aws-creds';
export * from './local-invocations';
export * from './test-accounts';
export * from './item-exception-summary';

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

export async function getItemExceptionSummaryPrompts(
    retailerId: number,
    supplierId: number,
): Promise<ItemExceptionCountPrompt[]> {
    const resp = await axiosRequest(
        new ItemExceptionSummaryRequest(getDscoEnv(), { retailerId, supplierId }),
        getDscoEnv(),
        getApiCredentials(),
        getAwsRegion(),
    );

    if (!resp.data.success) {
        throw new Error('Failed loading content exception summary');
    }

    return resp.data.exceptionCounts.map((e) => {
        return {
            name: `${e.categoryPath} (${e.count} exception${e.count === 1 ? '' : 's'})`,
            value: e.categoryPath,
        };
    });
}
