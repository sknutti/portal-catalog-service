import * as AWS from 'aws-sdk';
import * as uuid from 'uuid';

const s3 = new AWS.S3({ region: process.env.AWS_REGION, signatureVersion: 'v4', });

export function getSignedS3Url<M>(path: string, metadata: M): Promise<string> {
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: path,
        Expires: 60 * 60, // expire the link in 1 hour
        Metadata: prepareMetadata(metadata)
    };

    return s3.getSignedUrlPromise('putObject', params);
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
    const resp = await s3
        .getObject({
            Bucket: process.env.S3_BUCKET!,
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
    await s3.copyObject({
        CopySource: `${from.bucket}/${from.path}`,
        Bucket: to.bucket,
        Key: to.path,
        Metadata: prepareMetadata(metadata),
        MetadataDirective: 'REPLACE'
    }).promise();
}

export async function downloadS3Metadata<Metadata>(
  path: string
): Promise<Metadata> {
    const resp = await s3
      .headObject({
          Bucket: process.env.S3_BUCKET!,
          Key: path,
      })
      .promise();

    const meta: Record<string, string> = {};
    for (const [key, val] of Object.entries(resp.Metadata || {})) {
        meta[key] = decodeURIComponent(val);
    }

    return meta as any as Metadata;
}

export async function writeS3Object(bucket: string, path: string, body: string): Promise<void> {
    await s3.putObject({
        Bucket: bucket,
        Key: path,
        Body: body
    }).promise();
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

export function parseCatalogItemS3UploadUrl(
  url: string,
): { supplierId: number; retailerId: number; userId: number; } | 'error' {
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
