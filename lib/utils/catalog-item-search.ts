import { axiosRequest } from '@dsco/aws-auth';
import { ItemSearchRequest } from '@dsco/search-apis';
import { SecretsManagerHelper } from '@dsco/service-utils';
import { Catalog, SnakeCase } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { getAwsRegion, getDscoEnv, getIsRunningLocally } from '@lib/environment';
import { getApiCredentials } from '@lib/utils/api-credentials';
import { MongoClient } from 'mongodb';

interface MongoSecret {
    portalCatalogConnectString: string;
    ca: string;
}

let mongoSecretHelper: SecretsManagerHelper<MongoSecret> | undefined;

let mongoClient: MongoClient | undefined;
let connectString: string | undefined;

export async function catalogItemSearch(
  supplierId: number,
  retailerId: number,
  categoryPath: string,
  // Optionally, directly ask mongo for a set of skus.  If not provided, an ES search will occur
  directlyLoadSkus?: string[]
): Promise<CoreCatalog[]> {
    let itemIdsFromMongo: number[] = [];

    if (!directlyLoadSkus) {
        const env = getDscoEnv();
        // First we do an ES request to find all items in the category
        const searchResp = await axiosRequest(
          new ItemSearchRequest(env, {
              full_detail: false,
              supplier_id: supplierId,
              exact_categories: {
                  [retailerId]: [categoryPath]
              },
              limit: 10_000
          }),
          env,
          getApiCredentials(),
          getAwsRegion()
        );


        if (!searchResp.data.success) {
            throw new Error(`Bad response running catalog item search: ${JSON.stringify(searchResp.data)}`);
        }

        itemIdsFromMongo = searchResp.data.docs;
    }

    if (!mongoSecretHelper) {
        mongoSecretHelper = new SecretsManagerHelper<MongoSecret>(`mongo-${getDscoEnv()}`, 60000);
    }

    // Then we load those ids from mongo
    const mongoSecret = await mongoSecretHelper.getValue();
    if (!mongoClient || connectString !== mongoSecret.portalCatalogConnectString) {
        connectString = mongoSecret.portalCatalogConnectString;

        mongoClient = await MongoClient.connect(mongoSecret.portalCatalogConnectString, {
            useNewUrlParser: true,
            ssl: true,
            sslValidate: true,
            useUnifiedTopology: true,
            sslCA: [mongoSecret.ca]
        });
    }

    const mongoResp = await mongoClient
      .db()
      .collection('Item')
      .find<SnakeCase<Catalog>>({
          $or: [
              {
                  item_id: {$in: itemIdsFromMongo}
              },
              {
                  sku: {$in: directlyLoadSkus || []},
                  supplier_id: supplierId
              }
          ]
      })
      .toArray();

    // Close the mongo client when running locally to prevent process from hanging
    if (getIsRunningLocally()) {
        mongoClient.close();
        mongoClient = undefined;
    }

    return mongoResp as CoreCatalog[];
}
