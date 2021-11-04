import { getFanaticsAccountForEnv } from '@lib/fanatics';
import { CatalogSpreadsheetS3Metadata, copyS3Object, createCatalogItemS3UploadPath } from '@lib/s3';
import type { S3CreateEvent } from 'aws-lambda';

/**
 * Looks for a file being uploaded into the fanatics bucket, then copies it into the appropriate place in the portal catalog bucket
 */
export async function fanaticsUploadHandler(event: S3CreateEvent): Promise<void> {
    const record = event.Records[0].s3;

    const account = getFanaticsAccountForEnv();
    if (!account) {
        throw new Error(`Unexpected dsco env: ${process.env.ENVIRONMENT}`);
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
