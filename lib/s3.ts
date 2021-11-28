import { getAwsRegion, getPortalCatalogS3BucketName } from '@lib/environment';
import * as AWS from 'aws-sdk';
import * as uuid from 'uuid';

let s3: AWS.S3 | undefined;

function getS3Client(): AWS.S3 {
    if (s3) {
        return s3;
    } else {
        s3 = new AWS.S3({ region: getAwsRegion(), signatureVersion: 'v4' });
        return s3;
    }
}

export function getSignedS3UploadUrl<M>(path: string, metadata: M): Promise<string> {
    const params = {
        Bucket: getPortalCatalogS3BucketName(),
        Key: path,
        Expires: 60 * 60, // expire the link in 1 hour
        Metadata: prepareMetadata(metadata),
    };

    return getS3Client().getSignedUrlPromise('putObject', params);
}

export function getSignedS3DownloadUrl<M>(path: string, downloadFilename: string): Promise<string> {
    const params = {
        Bucket: getPortalCatalogS3BucketName(),
        Key: path,
        Expires: 60 * 60, // expire the link in 1 hour
        ResponseContentDisposition: `attachment; filename ="${encodeURIComponent(downloadFilename)}"`,
    };

    return getS3Client().getSignedUrlPromise('getObject', params);
}

function prepareMetadata<M>(metadata: M): Record<string, string> {
    const meta: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata)) {
        if (!value) {
            continue;
        }

        if (key.match(/[A-Z]/)) {
            throw new Error('Tried storing capitalized s3 metadata key - these must be lowercase only');
        } else if (typeof value !== 'string') {
            throw new Error('Tried storing non-string type in s3 metadata');
        }
        meta[key] = encodeURIComponent(value);
    }

    return meta;
}

export async function downloadS3Bucket(path: string): Promise<Buffer> {
    const resp = await getS3Client()
        .getObject({
            Bucket: getPortalCatalogS3BucketName(),
            Key: path,
        })
        .promise();

    return resp.Body as Buffer;
}

interface S3File {
    bucket: string;
    path: string;
}

/**
 * @param from - The location to copy from - *MUST ALREADY BE URL ENCODED*
 */
export async function copyS3Object<Metadata>(from: S3File, to: S3File, metadata: Metadata) {
    await getS3Client()
        .copyObject({
            CopySource: `${from.bucket}/${from.path}`,
            Bucket: to.bucket,
            Key: to.path,
            Metadata: prepareMetadata(metadata),
            MetadataDirective: 'REPLACE',
        })
        .promise();
}

export async function downloadS3Metadata<Metadata>(path: string): Promise<Metadata> {
    const resp = await getS3Client()
        .headObject({
            Bucket: getPortalCatalogS3BucketName(),
            Key: path,
        })
        .promise();

    const meta: Record<string, string> = {};
    for (const [key, val] of Object.entries(resp.Metadata || {})) {
        meta[key] = decodeURIComponent(val);
    }

    return meta as any as Metadata;
}

export async function writeS3Object(bucket: string, path: string, body: string | Buffer): Promise<void> {
    await getS3Client()
        .putObject({
            Bucket: bucket,
            Key: path,
            Body: body,
        })
        .promise();
}

export function createCatalogItemS3UploadPath(
    supplierId: number,
    retailerId: number,
    userId: number,
    path: string,
): string {
    const uploadId = uuid.v4();
    return `uploads/${supplierId}/${retailerId}/${userId}/${path.replace(/\|\|/g, '/')}/${uploadId}`;
}

export function createCatalogItemS3DownloadPath(
    supplierId: number,
    retailerId: number,
    userId: number,
    path: string,
): string {
    const downloadId = uuid.v4();
    return `downloads/${supplierId}/${retailerId}/${userId}/${path.replace(/\|\|/g, '/')}/${downloadId}`;
}

export function parseCatalogItemS3UploadUrl(
    url: string,
): { supplierId: number; retailerId: number; userId: number } | 'error' {
    url = url.split('?')[0];
    const regex = /uploads\/(\d+)\/(\d+)\/(\d+)\/.*$/;
    const match = regex.exec(url);

    if (match) {
        return {
            supplierId: +match[1],
            retailerId: +match[2],
            userId: +match[3],
        };
    } else {
        return 'error';
    }
}

/**
 * These keys are snake_case as metadata keys must be lowercase
 */
export interface CatalogSpreadsheetS3Metadata {
    category_path: string;
    // Comma separated
    skipped_row_indexes?: string;
    // Signifies this file was uploaded via a local test and should be skipped from automated processing
    is_local_test?: 'true' | 'false';
}
