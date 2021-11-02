import * as AWS from 'aws-sdk';
import * as uuid from 'uuid';

const s3 = new AWS.S3({ region: process.env.AWS_REGION, signatureVersion: 'v4', });

export function getSignedS3Url<M>(path: string, metadata: M): Promise<string> {
    const meta: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata)) {
        if (key.match(/[A-Z]/)) {
            throw new Error('Tried storing capitalized s3 metadata key - these must be lowercase only');
        } else if (typeof value !== 'string') {
            throw new Error('Tried storing non-string type in s3 metadata');
        }
        meta[key] = encodeURIComponent(value);
    }

    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: path,
        Expires: 60 * 60, // expire the link in 1 hour
        Metadata: meta
    };

    return s3.getSignedUrlPromise('putObject', params);
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

export function getCatalogItemS3UploadPath(
  supplierId: number,
  retailerId: number,
  userId: number,
  path: string,
): string {
    const uploadId = uuid.v4();
    return `upload/${supplierId}/${retailerId}/${userId}/${path.replace(/\|\|/g, '/')}/${uploadId}`;
}

export function parseCatalogItemS3UploadUrl(
  url: string,
): { supplierId: number; retailerId: number; userId: number; } | 'error' {
    url = url.split('?')[0];
    const regex = /upload\/(\d+)\/(\d+)\/(\d+)\/.*$/;
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
}
