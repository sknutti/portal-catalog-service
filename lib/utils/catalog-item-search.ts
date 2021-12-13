import { axiosRequest } from '@dsco/aws-auth';
import { ItemSearchRequest } from '@dsco/search-apis';
import { SecretsManagerHelper } from '@dsco/service-utils';
import { DsError } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { getAwsRegion, getDscoEnv, getIsRunningLocally } from '@lib/environment';
import { assertUnreachable, getApiCredentials } from '@lib/utils';
import { FilterQuery, MongoClient } from 'mongodb';
import { ItemExceptionSearchV1Request, ItemSearchV2Request } from './item-search-v2.request';
import { batch, map } from './iter-tools';

interface MongoSecret {
    portalCatalogConnectString: string;
    ca: string;
}

let mongoSecretHelper: SecretsManagerHelper<MongoSecret> | undefined;

let mongoClient: MongoClient | undefined;
let connectString: string | undefined;

/**
 * Uses ElasticSearch to search for all items in the given category, then loads them from mongo
 */
export async function catalogItemSearch(
    supplierId: number,
    retailerId: number,
    categoryPath: string,
): Promise<CoreCatalog[]> {
    const env = getDscoEnv();

    let itemIds: number[] = [];

    // First we do ES queries to find all items in the category
    let totalItems = 1;
    let pageNumber = 0;
    let paginationKey: any = null;

    while (itemIds.length < totalItems) {
        const searchResp = await axiosRequest(
            new ItemSearchV2Request(env, {
                fullDetail: false,
                supplierId: supplierId,
                categories: [
                    {
                        retailerId,
                        includeItemsInChildCategories: false,
                        filterType: 'AND',
                        paths: [categoryPath],
                    },
                ],
                pageSize: 10_000,
                pageNumber,
                paginationKey,
                version: 2,
                objectType: 'ITEM',
            }),
            env,
            getApiCredentials(),
            getAwsRegion(),
        );

        if (!searchResp.data.success) {
            throw new Error(`Bad response running catalog item search: ${JSON.stringify(searchResp.data)}`);
        }

        if (!searchResp.data.docs.length) {
            break;
        }

        itemIds = itemIds.concat(searchResp.data.docs);
        totalItems = searchResp.data.hits;
        pageNumber++;
        paginationKey = searchResp.data.paginationKey;
    }

    // Then we load those items from mongo
    return await loadCatalogItemsFromMongo(supplierId, 'item_id', itemIds);
}

export async function loadCatalogItemsFromMongo<Identifier extends 'sku' | 'item_id'>(
    supplierId: number,
    identifier: Identifier,
    idsToLoad: Array<CoreCatalog[Identifier]>,
): Promise<CoreCatalog[]> {
    if (!mongoSecretHelper) {
        mongoSecretHelper = new SecretsManagerHelper<MongoSecret>(`mongo-${getDscoEnv()}`, 60000);
    }

    const mongoSecret = await mongoSecretHelper.getValue();
    if (!mongoClient || connectString !== mongoSecret.portalCatalogConnectString) {
        connectString = mongoSecret.portalCatalogConnectString;

        mongoClient = await MongoClient.connect(mongoSecret.portalCatalogConnectString, {
            useNewUrlParser: true,
            ssl: true,
            sslValidate: true,
            useUnifiedTopology: true,
            sslCA: [mongoSecret.ca],
        });
    }

    let query: FilterQuery<CoreCatalog>;
    if (identifier === 'sku') {
        query = {
            sku: { $in: idsToLoad },
            supplier_id: supplierId,
        };
    } else if (identifier === 'item_id') {
        query = {
            item_id: { $in: idsToLoad },
        };
    } else {
        return assertUnreachable(identifier, 'identifierType');
    }

    const mongoResp = await mongoClient.db().collection('Item').find<CoreCatalog>(query).toArray();

    // Close the mongo client when running locally to prevent process from hanging
    if (getIsRunningLocally()) {
        await mongoClient.close();
        mongoClient = undefined;
    }

    return mongoResp;
}

/**
 * Looks for items with content exceptions using ElasticSearch
 * Same thing as catalogItemSearch but hitting ItemExceptionSearchV1Request instead
 * TODO CCR placeholder for now, fill out later (https://chb.atlassian.net/browse/CCR-112)
 */
export async function catalogExceptionsItemSearch(
    supplierId: number,
    retailerId: number,
    categoryPath: string,
): Promise<CoreCatalog[]> {
    const env = getDscoEnv();

    // ES Query
    const searchResp = await axiosRequest(
        new ItemExceptionSearchV1Request(env, {
            supplierId: supplierId,
            channelId: retailerId,
            categoryPath: categoryPath,
            version: 1,
            objectType: 'ITEM',
        }),
        env,
        getApiCredentials(),
        getAwsRegion(),
    );

    console.log(`Got query data: ${JSON.stringify(searchResp.data)}`);

    if (!searchResp.data.success) {
        throw new Error(`Bad response running catalog item search: ${JSON.stringify(searchResp.data, null, 4)}`);
    }

    // Filter results to just have the item ids
    const itemIds: number[] = searchResp.data.items.map((item) => item.item_id);
    console.log(`Got item ids: ${JSON.stringify(itemIds)}`);

    // Then we load those items from mongo
    return await loadCatalogItemsFromMongo(supplierId, 'item_id', itemIds);
}
