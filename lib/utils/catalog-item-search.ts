import { axiosRequest } from '@dsco/aws-auth';
import { ItemSearchRequest } from '@dsco/search-apis';
import { SecretsManagerHelper } from '@dsco/service-utils';
import { CoreCatalog } from '@lib/core-catalog';
import { getAwsRegion, getDscoEnv, getIsRunningLocally } from '@lib/environment';
import { assertUnreachable, getApiCredentials } from '@lib/utils';
import { FilterQuery, MongoClient } from 'mongodb';

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

    // First we do an ES request to find all items in the category
    const searchResp = await axiosRequest(
        new ItemSearchRequest(env, {
            full_detail: false,
            supplier_id: supplierId,
            exact_categories: {
                [retailerId]: [categoryPath],
            },
            // A 2000 item limit for now so that the generate doesn't call with too large a spreadsheet
            limit: 2_000,
        }),
        env,
        getApiCredentials(),
        getAwsRegion(),
    );

    if (!searchResp.data.success) {
        throw new Error(`Bad response running catalog item search: ${JSON.stringify(searchResp.data)}`);
    }

    // Then we load those items from mongo
    return await loadCatalogItemsFromMongo(supplierId, 'item_id', searchResp.data.docs);
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
