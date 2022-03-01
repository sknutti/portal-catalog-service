import { S3CreateEvent } from 'aws-lambda';

export async function copyChannelOverrideSpreadsheetToApiV3(
    inEvent: S3CreateEvent
): Promise<void> {
    console.log('inEvent:', inEvent);
}