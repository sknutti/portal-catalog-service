import { DscoEnv } from '@dsco/ts-models';
import { CatalogSpreadsheetS3Metadata, copyS3Object, createCatalogItemS3UploadPath } from '@lib/s3';
import type { S3CreateEvent } from 'aws-lambda';

const env = process.env.ENVIRONMENT! as DscoEnv;

/**
 * Looks for a file being uploaded into the fanatics bucket, then copies it into the appropriate place in the portal catalog bucket
 */
export async function fanaticsUploadHandler(event: S3CreateEvent): Promise<void> {
    const record = event.Records[0].s3;

    const account = accounts[env];
    if (!account) {
        throw new Error(`Unexpected dsco env: ${env}`);
    }

    const meta: CatalogSpreadsheetS3Metadata = {
        category_path: account.categoryPath
    };

    const from = {
        bucket: record.bucket.name,
        path: record.object.key
    };
    const to = {
        bucket: process.env.S3_BUCKET!,
        path: createCatalogItemS3UploadPath(account.supplierId, account.retailerId, account.userId, account.categoryPath)
    };

    console.log('Copying s3 file from: ', from);
    console.log('to destination: ', to);
    console.log('with meta: ', meta);

    await copyS3Object(from, to, meta);
}

const accounts: Partial<Record<DscoEnv, Account>> = {
    // In test we upload to "Aidan Test Supplier"
    test: {
        supplierId: 1000012302,
        retailerId: 1000012301,
        userId: 26366,
        categoryPath: 'Catalog'
    },
    staging: {
        supplierId: 1000007967,
        retailerId: 1000007220,
        userId: 1000011189,
        categoryPath: 'Fan Gear'
    }
    // prod: {
    //     supplierId: 1000007967,
    //     retailerId: 1000007220,
    //     userId: 1000011189,
    //     categoryPath: 'Fan Gear'
    // }
};

interface Account {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
}
