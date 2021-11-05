import { generateCategorySpreadsheet } from '@api/generate-category-spreadsheet/generate-category-spreadsheet';
import {
    CatalogSpreadsheetWebsocketEvents,
    GenerateCategorySpreadsheetRequestBody,
    GenerateCategorySpreadsheetResponse,
    PublishCategoryResponse,
    PublishCategorySpreadsheetRequestBody
} from '@api/index';
import { publishCategorySpreadsheet } from '@api/publish-category-spreadsheet/publish-category-spreadsheet';
import { publishCategorySpreadsheet as publishCategorySpreadsheetBot } from '@bot/publish-category-spreadsheet/publish-category-spreadsheet';
import { axiosRequest } from '@dsco/aws-auth';
import { AttributionCategory } from '@dsco/ts-models';
import { LoadCatalogAttributionsRequest } from '@lib/requests';
import { XlsxSpreadsheet } from '@lib/spreadsheet';
import { getApiCredentials, gunzipAsync, randomInt } from '@lib/utils';
import { setTestWebsocketHandler } from '@lib/utils/send-websocket-event';
import type { S3CreateEvent } from 'aws-lambda';
import axios from 'axios';
import { initAWSCredentials, invokeHandlerLocally } from '../test-utils';

// Aidan Test Retailer
const retailerId = 1000012301;
// Aidan Test Supplier
const userId = 26366;

// Note: This test requires the dsco vpn to run as it uses both Mongo and Gearman
test('it successfully generates a catalog spreadsheet that can be re-uploaded', async () => {
    const identityId = await initAWSCredentials(userId);

    const categoryPath = await getTestCatalogCategoryPath();
    const generatedSpreadsheet = await generateSpreadsheet(categoryPath, identityId);

    const uploadUrl = await getSpreadsheetUploadUrl(categoryPath, identityId);

    // Write the generated spreadsheet to the s3 bucket
    await axios.put(uploadUrl, generatedSpreadsheet);

    // Invoke the publish bot and wait for websocket success at the same time
    await Promise.all([invokePublishBot(uploadUrl), waitForWebsocketSuccess()]);

}, 120_000);


async function generateSpreadsheet(categoryPath: string, identityId: string): Promise<Buffer> {
    const body: GenerateCategorySpreadsheetRequestBody = {
        retailerId,
        categoryPath
    };

    const resp = await invokeHandlerLocally<GenerateCategorySpreadsheetResponse>(generateCategorySpreadsheet, body, identityId);

    expect(resp).toBeTruthy();
    expect(resp.gzippedFile).toBeTruthy();

    const unzipped = await gunzipAsync(resp.gzippedFile);
    expect(XlsxSpreadsheet.isXlsx(unzipped)).toBe(true);

    return unzipped;
}

async function getSpreadsheetUploadUrl(categoryPath: string, identityId: string): Promise<string> {
    const body: PublishCategorySpreadsheetRequestBody = {
        retailerId,
        categoryPath,
        skippedRowIndexes: []
    };

    const resp = await invokeHandlerLocally<PublishCategoryResponse>(publishCategorySpreadsheet, body, identityId);

    expect(resp).toBeTruthy();
    expect(resp.uploadUrl).toBeTruthy();

    return resp.uploadUrl;
}

function parseSpreadsheetUploadUrl(url: string): { bucket: string, path: string } {
    const regex = /https:\/\/(.*?)\.s3\.amazonaws.com\/(.*?)\?/;
    const matches = regex.exec(url);
    if (!matches) {
        throw new Error(`Unexpected upload url: ${url}`);
    }

    return {
        bucket: matches[1],
        path: matches[2]
    };
}

async function invokePublishBot(uploadUrl: string): Promise<void> {
    const {bucket, path} = parseSpreadsheetUploadUrl(uploadUrl);

    const event = {
        Records: [{
            s3: {
                bucket: {
                    name: bucket
                },
                object: {
                    key: path
                }
            }
        }]
    } as S3CreateEvent;

    await publishCategorySpreadsheetBot(event);
}

function waitForWebsocketSuccess(): Promise<void> {
    return new Promise((resolve, reject) => {
        setTestWebsocketHandler((type, data) => {
            if (type === 'success') {
                const success = data as CatalogSpreadsheetWebsocketEvents['success'];

                if (success.rowWithError) {
                    reject(`Spreadsheet had validation errors: \n- ${success.validationMessages?.join('\n- ')}`);
                } else {
                    resolve();
                }
            } else if (type === 'error') {
                const error = data as CatalogSpreadsheetWebsocketEvents['error'];
                reject(`Invocation error: ${error.message}\n\n${error.error}`);
            }
        });
    });
}

export async function getTestCatalogCategoryPath(): Promise<string> {
    const resp = await axiosRequest(new LoadCatalogAttributionsRequest('test', retailerId), 'test', getApiCredentials(), 'us-east-1');

    if (!resp.data.success) {
        throw new Error('Failed loading catalog attributions');
    }

    const activeAttribution = resp.data.attributions.find(attr => attr.active);
    if (!activeAttribution) {
        throw new Error('No active catalog attribution');
    }

    const children: AttributionCategory[] = Object.values(activeAttribution.children || {});
    if (!children.length) {
        throw new Error('No child categories for active attribution');
    }

    const child = children[randomInt(0, children.length - 1)];
    return child.path;
}

