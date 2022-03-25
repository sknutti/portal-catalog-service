import { getPortalCatalogS3BucketName } from '@lib/environment';
import { getFanaticsAccountForEnv, getRetailerIdFromPath } from '@lib/fanatics';
import { CatalogSpreadsheetS3Metadata, copyS3Object, createCatalogItemS3UploadPath } from '@lib/s3';
import type { S3CreateEvent } from 'aws-lambda';

/**
 * Looks for a file being uploaded into the fanatics bucket, then copies it into the appropriate place in the portal catalog bucket
 */
export async function fanaticsUploadHandler(event: S3CreateEvent): Promise<void> {
    const record = event.Records[0].s3;

    const account = getFanaticsAccountForEnv();
    if (!account) {
        throw new Error(`No fanatics account for dsco env: ${process.env.ENVIRONMENT}`);
    }

    let s3Path = record.object.key;
    s3Path = s3Path.replace(/\+/g, ' ');
    s3Path = decodeURIComponent(s3Path);

    const retailerId = getRetailerIdFromPath(s3Path, account.retailerId);

    const meta: CatalogSpreadsheetS3Metadata = {
        category_path: account.categoryPath,
        source_s3_path: s3Path,
    };

    const from = {
        bucket: record.bucket.name,
        path: record.object.key,
    };
    const to = {
        bucket: getPortalCatalogS3BucketName(),
        path: createCatalogItemS3UploadPath(
            account.supplierId,
            retailerId,
            account.userId,
            account.categoryPath,
        ),
    };

    console.log('Copying s3 file from: ', from);
    console.log('to destination: ', to);
    console.log('with meta: ', meta);

    await copyS3Object(from, to, meta);
}
