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

export async function catalogItemSearch(supplierId: number, retailerId: number, categoryPath: string): Promise<CoreCatalog[]> {
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
    const client = await MongoClient.connect(mongoSecret.portalCatalogConnectString, {
        useNewUrlParser: true,
        ssl: true,
        sslValidate: true,
        sslCA: [mongoSecret.ca]
    });

    const mongoResp = await client.db().collection('Item').find<SnakeCase<Catalog>>({
        item_id: {$in: searchResp.data.docs}
    }).toArray();


    return mongoResp as CoreCatalog[];
}
