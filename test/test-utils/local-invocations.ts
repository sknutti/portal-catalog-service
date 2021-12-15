import { generateCategorySpreadsheet } from '@api/generate-category-spreadsheet/generate-category-spreadsheet';
import { getAssortments } from '@api/get-assortments/get-assortments';
import { getCategorySpreadsheetUploadUrl } from '@api/get-category-spreadsheet-upload-url/get-category-spreadsheet-upload-url';
import { getContentExceptionsSpreadsheet } from '@api/get-content-exceptions-spreadsheet/get-content-exceptions-spreadsheet';
import {
    Assortment,
    CatalogSpreadsheetWebsocketEvents,
    GenerateCategorySpreadsheetRequest,
    GetAssortmentsRequest,
    GetCategorySpreadsheetUploadUrlRequest,
    GenerateContentExceptionsSpreadsheetRequest,
} from '@api/index';
import { publishCategorySpreadsheet } from '@bot/publish-category-spreadsheet/publish-category-spreadsheet';
import { createContext } from '@dsco/service-utils';
import { DsRequest, DsRequestBody, DsRequestResponse } from '@dsco/ts-models';
import { XlsxSpreadsheet } from '@lib/spreadsheet';
import { gunzipAsync } from '@lib/utils';
import { setTestWebsocketHandler } from '@lib/utils/send-websocket-event';
import type { S3CreateEvent } from 'aws-lambda';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import axios, { AxiosResponse } from 'axios';

async function locallyInvokeHandler<R extends DsRequest<any, any, any>>(
    handler: (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>,
    body: DsRequestBody<R>,
    identityId: string,
): Promise<DsRequestResponse<R>> {
    const result = await handler(
        {
            body: JSON.stringify(body),
            requestContext: {
                identity: {
                    cognitoIdentityId: identityId,
                },
            },
        } as APIGatewayProxyEvent,
        createContext(),
    );

    const resp: DsRequestResponse<R> = JSON.parse(result.body);
    if (!resp || !resp.success) {
        throw new Error(`Expected successful ${handler.name} response, found: ${JSON.stringify(resp)}`);
    }
    return resp;
}

export async function locallyInvokeGetSpreadsheetUploadUrlApi(
    categoryPath: string,
    retailerId: number,
    identityId: string,
): Promise<string> {
    const resp = await locallyInvokeHandler<GetCategorySpreadsheetUploadUrlRequest>(
        getCategorySpreadsheetUploadUrl,
        {
            retailerId,
            categoryPath,
            skippedRowIndexes: [],
        },
        identityId,
    );

    expect(resp.uploadUrl).toBeTruthy();

    return resp.uploadUrl;
}

export async function locallyInvokeGetAssortmentsApi(identityId: string): Promise<Assortment[]> {
    const resp = await locallyInvokeHandler<GetAssortmentsRequest>(getAssortments, null, identityId);

    expect(resp.assortments).toBeTruthy();

    return resp.assortments;
}

export async function locallyInvokePublishBot(uploadUrl: string): Promise<void> {
    const { bucket, path } = parseSpreadsheetUploadUrl(uploadUrl);

    const event = {
        Records: [
            {
                s3: {
                    bucket: {
                        name: bucket,
                    },
                    object: {
                        key: path,
                    },
                },
            },
        ],
    } as S3CreateEvent;

    let websocketSuccess = false;
    waitForWebsocketSuccess().then(() => (websocketSuccess = true));

    await publishCategorySpreadsheet(event);

    expect(websocketSuccess).toBe(true);
}

export async function locallyInvokeGenerateSpreadsheetApi(
    categoryPath: string,
    retailerId: number,
    identityId: string,
): Promise<Buffer> {
    const resp = await locallyInvokeHandler<GenerateCategorySpreadsheetRequest>(
        generateCategorySpreadsheet,
        {
            retailerId,
            categoryPath,
        },
        identityId,
    );

    expect(resp.downloadUrl).toBeTruthy();

    // Download via the signed url
    const s3Resp = await axios.get<any, AxiosResponse<Buffer>>(resp.downloadUrl, { responseType: 'arraybuffer' });
    expect(XlsxSpreadsheet.isXlsx(s3Resp.data)).toBe(true);

    return s3Resp.data;
}

export async function locallyInvokeGetContentExceptionsApi(
    categoryPath: string,
    retailerId: number,
    identityId: string,
): Promise<Buffer> {
    const resp = await locallyInvokeHandler<GenerateContentExceptionsSpreadsheetRequest>(
        getContentExceptionsSpreadsheet,
        { retailerId, categoryPath },
        identityId,
    );

    expect(resp.gzippedFile).toBeTruthy();

    const unzipped = await gunzipAsync(resp.gzippedFile);
    expect(XlsxSpreadsheet.isXlsx(unzipped)).toBe(true);

    return unzipped;
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

function parseSpreadsheetUploadUrl(url: string): { bucket: string; path: string } {
    const regex = /https:\/\/(.*?)\.s3\.amazonaws.com\/(.*?)\?/;
    const matches = regex.exec(url);
    if (!matches) {
        throw new Error(`Unexpected upload url: ${url}`);
    }

    return {
        bucket: matches[1],
        path: matches[2],
    };
}
