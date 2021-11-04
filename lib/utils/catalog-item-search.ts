import { axiosRequest } from '@dsco/aws-auth';
import { ItemSearchRequest } from '@dsco/search-apis';
import { SecretsManagerHelper } from '@dsco/service-utils';
import { Catalog, DscoEnv, SnakeCase } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { getApiCredentials } from '@lib/utils/api-credentials';
import * as AWS from 'aws-sdk';
import { Credentials } from 'aws-sdk';
import { MongoClient } from 'mongodb';

const env = process.env.ENVIRONMENT! as DscoEnv;

interface MongoSecret {
    portalCatalogConnectString: string;
    ca: string;
}

const mongoSecretHelper = new SecretsManagerHelper<MongoSecret>(`mongo-${env}`, 60000);

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
          process.env.AWS_REGION!
        );


        if (!searchResp.data.success) {
            throw new Error(`Bad response running catalog item search: ${JSON.stringify(searchResp.data)}`);
        }

        itemIdsFromMongo = searchResp.data.docs;
    }

    // Then we load those ids from mongo
    const mongoSecret = await mongoSecretHelper.getValue();
    if (!mongoClient || connectString !== mongoSecret.portalCatalogConnectString) {
        connectString = mongoSecret.portalCatalogConnectString;

        mongoClient = await MongoClient.connect(mongoSecret.portalCatalogConnectString, {
            useNewUrlParser: true,
            ssl: true,
            sslValidate: true,
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

    return mongoResp as CoreCatalog[];
}
