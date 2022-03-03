import { CatalogChannelOverrideSpreadsheetUploadS3Metadata } from '@lib/s3';
import { S3CreateEvent } from 'aws-lambda';
import * as AWS from 'aws-sdk';

export async function copyChannelOverrideSpreadsheetToApiV3(
    inEvent: S3CreateEvent
): Promise<void> {
    const eventBucket = inEvent.Records[0].s3.bucket.name;
    const eventKey = inEvent.Records[0].s3.object.key;
    const sourcePath = `${inEvent.Records[0].s3.bucket.name}/${inEvent.Records[0].s3.object.key}`;

    const apiV3ChannelOverrideBucketName = process.env.API_V3_CHANNEL_OVERRIDE_BUCKET_NAME;
    const apiV3ChannelOverrideUploadDir = process.env.API_V3_CHANNEL_OVERRIDE_UPLOAD_DIR;

    if(!apiV3ChannelOverrideBucketName){
        throw new Error('ApiV3 bucket name does not exist. Aborting copy operation.');
    }

    if(!apiV3ChannelOverrideUploadDir){
        throw new Error('No upload directory defined for apiv3 bucket. Aborting copy operation');
    }

    const s3 = new AWS.S3();

    const headObjectParams: AWS.S3.HeadObjectRequest = {
        Bucket: eventBucket,
        Key: eventKey
    };

    const objectMetadata = (await s3.headObject(headObjectParams).promise()).Metadata;

    if(!objectMetadata){
        throw new Error('No metadata found on S3 object');
    }

    const channelOverrideMetadata: CatalogChannelOverrideSpreadsheetUploadS3Metadata = JSON.parse(objectMetadata.data);

    const accountId = channelOverrideMetadata.accountId;

    const now = new Date();
	const datePath = `${now.getUTCFullYear()}/${now.getUTCMonth()
		.toString()
		.padStart(2, '0')}/${now.getUTCDate()
		.toString()
		.padStart(2, '0')}`;

    const copyParams: AWS.S3.CopyObjectRequest = {
        CopySource: sourcePath,
        Bucket: apiV3ChannelOverrideBucketName,
        Key: `${apiV3ChannelOverrideUploadDir}/${accountId}/${datePath}/${Date.now()}`
    };

    console.log('copyParams:', copyParams);

    await s3.copyObject(copyParams).promise();
}