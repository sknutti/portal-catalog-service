import { axiosRequest } from '@dsco/aws-auth';
import { ItemSearchRequest } from '@dsco/search-apis';
import { SecretsManagerHelper } from '@dsco/service-utils';
import { Catalog, DscoEnv, SnakeCase } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
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
  // Other skus to directly ask mongo for, in case the sku exists and is in the spreadsheet, but not yet in the category
  includeSkus: string[] = []
): Promise<CoreCatalog[]> {
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
      AWS.config.credentials as Credentials,
      process.env.AWS_REGION!
    );

    if (!searchResp.data.success) {
        throw new Error(`Bad response running catalog item search: ${JSON.stringify(searchResp.data)}`);
    }

    // Then we load those ids from mongo
    const mongoSecret = await mongoSecretHelper.getValue();
    if (!mongoClient || connectString !== mongoSecret.portalCatalogConnectString) {
        connectString = mongoSecret.portalCatalogConnectString;

        mongoClient = await MongoClient.connect(mongoSecret.portalCatalogConnectString, {
            useNewUrlParser: true,
            ssl: true,
            sslValidate: true,
            sslCA: [mongoSecret.ca],
        });
    }

    const mongoResp = await mongoClient.db().collection('Item').find<SnakeCase<Catalog>>({
        $or: [
            {
                item_id: {$in: searchResp.data.docs}
            },
            {
                sku: {$in: includeSkus},
                supplier_id: supplierId
            }
        ],
    }).toArray();

    return mongoResp as CoreCatalog[];
}
