import { CatalogResolver } from '@bot/publish-category-spreadsheet/catalog-resolver';
import { keyWith, UnexpectedError } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { getIsRunningLocally } from '@lib/environment';
import { FanoutError, fanoutIfLargeSpreadsheetAndFanatics, sendFanaticsEmail } from '@lib/fanatics';
import {
    CatalogSpreadsheetS3Metadata,
    downloadS3Bucket,
    downloadS3Metadata,
    parseCatalogItemS3UploadUrl,
} from '@lib/s3';
import { DscoSpreadsheet, generateDscoSpreadsheet, PhysicalSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { CsvSpreadsheet } from '@lib/spreadsheet/physical-spreadsheet/csv-spreadsheet';
import { gzipAsync, isInRange, loadCatalogItemsFromMongo, randomFloat, WarehousesLoader } from '@lib/utils';
import { batch, collect, enumerate, filter, map } from '@lib/utils/iter-tools';
import { sendWebsocketEvent } from '@lib/utils/send-websocket-event';
import type { S3CreateEvent } from 'aws-lambda';
import { Err, Ok, Result } from 'ts-results';
import { CatalogSpreadsheetWebsocketEvents } from '../../api';

export interface PublishCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
    s3Path: string;
    // References the original s3 file fanatics uploaded, if any
    sourceS3Path?: string;
    uploadTime: Date;
    skippedRowIndexes?: number[];
    // Signifies this file was uploaded via a local test and should be skipped from automated processing
    isLocalTest?: boolean;
    // Inclusive
    fromRowIdx?: number;
    // Exclusive
    toRowIdx?: number;
    // Used to track child invocations when fanning out
    callId?: string;
}

// Purposely 10 seconds before actual timeout
const LAMBDA_TIMEOUT = 890 * 1_000;

export async function publishCategorySpreadsheet(
    inEvent: S3CreateEvent | PublishCategorySpreadsheetEvent,
): Promise<void> {
    const event = 'categoryPath' in inEvent ? inEvent : await getEventFromS3(inEvent);
    const callId = event.callId || Math.random().toString(36).substring(6).toUpperCase();

    console.log(`${callId} - Publish event extracted from s3 metadata: `, event);

    // Ignore any s3 events generated by unit tests
    if (event.isLocalTest && !getIsRunningLocally()) {
        return;
    }

    try {
        const resp = await timeoutPromise(publishSpreadsheetImpl(event, callId), LAMBDA_TIMEOUT);

        if (resp === 'timeout') {
            throw new Error('Timeout occurred publishing spreadsheet.');
        } else if (resp.ok) {
            await sendWebsocketEvent('success', resp.val, event.supplierId);
        } else {
            await sendFanaticsEmail(event, { genericMessage: `${resp.val.message}\n${resp.val.details}`, callId });

            await sendWebsocketEvent(
                'error',
                {
                    error: resp.val,
                    message: resp.val.message,
                    categoryPath: event.categoryPath,
                },
                event.supplierId,
            );
        }
    } catch (error: any) {
        if (error instanceof FanoutError) {
            console.warn(error.message);
            return;
        }

        await sendFanaticsEmail(event, {
            genericMessage: 'message' in error ? error.message : `Unexpected error: ${JSON.stringify(error)}`,
            callId,
        });
        await sendWebsocketEvent(
            'error',
            {
                error,
                message: 'message' in error ? error.message : 'Unexpected error',
                categoryPath: event.categoryPath,
            },
            event.supplierId,
        );
        throw error;
    }
}

async function getEventFromS3(createEvent: S3CreateEvent): Promise<PublishCategorySpreadsheetEvent> {
    console.log('Handling s3 object created: ', createEvent.Records[0]);

    let s3Path = createEvent.Records[0].s3.object.key;
    s3Path = s3Path.replace(/\+/g, ' ');
    s3Path = decodeURIComponent(s3Path);

    const [meta, lastModified] = await downloadS3Metadata<CatalogSpreadsheetS3Metadata>(s3Path);
    const skippedRowIndexes = meta.skipped_row_indexes
        ?.split(',')
        .map(parseInt)
        .filter((idx) => !isNaN(idx));

    const parsed = parseCatalogItemS3UploadUrl(s3Path);
    if (parsed === 'error') {
        throw new Error(`Failed parsing catalog s3 metadata. Url: ${s3Path}`);
    }
    const { supplierId, retailerId, userId } = parsed;

    if (!meta.category_path) {
        throw new Error(`S3 file ${s3Path} must have Metadata.category_path defined`);
    }

    return {
        s3Path,
        skippedRowIndexes,
        supplierId,
        retailerId,
        userId,
        uploadTime: lastModified,
        sourceS3Path: meta.source_s3_path,
        categoryPath: meta.category_path,
        isLocalTest: meta.is_local_test === 'true',
    };
}

async function publishSpreadsheetImpl(
    event: PublishCategorySpreadsheetEvent,
    callId: string,
): Promise<Result<CatalogSpreadsheetWebsocketEvents['success'], UnexpectedError>> {
    const { categoryPath, retailerId, supplierId, userId, s3Path, skippedRowIndexes, fromRowIdx, toRowIdx } = event;

    console.log(
        `${callId} - Starting processing for supplier: ${supplierId}, path: ${s3Path}, fromIdx: ${fromRowIdx}, toIdx: ${toRowIdx}`,
    );

    const sendProgress = (progress: number, message: string) => {
        return sendWebsocketEvent('progressUpdate', { progress, message, categoryPath }, supplierId);
    };

    const [, dscoSpreadsheet, warehouses, [supplierSpreadsheet, existingCatalogItems]] = await Promise.all([
        sendProgress(0.34, 'Parsing Spreadsheet...'),
        generateDscoSpreadsheet(supplierId, retailerId, categoryPath),
        WarehousesLoader.loadWarehouses(supplierId),
        loadSpreadsheetAndCatalogItems(event, callId),
    ] as const);

    if (!(dscoSpreadsheet instanceof DscoSpreadsheet)) {
        return Err(dscoSpreadsheet);
    }

    if (!supplierSpreadsheet) {
        return Ok({
            totalRowCount: 0,
            categoryPath,
        });
    }

    // Pull the row data from the google spreadsheet
    const catalogRows = supplierSpreadsheet.extractCatalogRows(
        dscoSpreadsheet,
        supplierId,
        retailerId,
        categoryPath,
        keyWith(existingCatalogItems, (item) => [item.sku!, item]),
        warehouses,
    );

    // Resolve the rows that were modified, giving progress updates
    const resolver = new CatalogResolver(supplierId, userId);

    const skippedRows = new Set(skippedRowIndexes);

    const dataRowCount = supplierSpreadsheet.numDataRows();
    let remainingRowsToValidate = dataRowCount;

    // Enumerate all of the rows starting at 1 for the header.  Then filter out the skipped rows, rows without data, and unmodified rows
    const rowsToSave = filter(enumerate(catalogRows, 1), ([row, rowIdx]) => {
        const needsSave =
            !row.emptyRow && row.modified && !skippedRows.has(rowIdx) && isInRange(rowIdx, fromRowIdx, toRowIdx);

        if (!needsSave) {
            remainingRowsToValidate -= 1;
        }

        return needsSave;
    });

    let batchSize = 20;
    if (remainingRowsToValidate > 5_000) {
        batchSize = 100;
    }

    const numConcurrentGearmanCalls = 15;
    const startValidationPct = randomFloat(0.45, 0.55);

    // Send batches of {batchSize} items to gearman at once
    const resolvedBatches = map(batch(rowsToSave, batchSize), (rows) => resolver.resolveBatch(rows, callId));

    // Batch the gearman calls to run as many as we can concurrently
    const gearmanCalls = map(batch(resolvedBatches, numConcurrentGearmanCalls), (gearmanCalls) =>
        Promise.all(collect(gearmanCalls)),
    );

    await sendProgress(startValidationPct, `Validating ${remainingRowsToValidate} modified rows...`);

    for await (const resolvedBatch of gearmanCalls) {
        for (const resolvedBatchError of resolvedBatch) {
            if (resolvedBatchError) {
                await sendFanaticsEmail(event, {
                    rowWithError: resolvedBatchError.rowIdx,
                    validationErrors: resolvedBatchError.messages,
                    callId,
                });

                return Ok({
                    totalRowCount: dataRowCount,
                    validationMessages: resolvedBatchError.messages,
                    rowWithError: resolvedBatchError.rowIdx,
                    sentRequest: await gzipAsync(Buffer.from(JSON.stringify(resolvedBatchError.sentRequest), 'utf8')),
                    categoryPath,
                });
            } else {
                remainingRowsToValidate -= batchSize;

                // Can happen if skipped rows.
                if (remainingRowsToValidate < 0) {
                    remainingRowsToValidate = 0;
                }
            }
        }

        const validationPct = (dataRowCount - remainingRowsToValidate) / dataRowCount;

        await sendProgress(
            (1 - startValidationPct) * validationPct + startValidationPct,
            `Validating ${numberWithCommas(remainingRowsToValidate)} rows...`,
        );

        console.log(
            `${callId} - Finished processing ${numberWithCommas(
                dataRowCount - remainingRowsToValidate,
            )} out of ${numberWithCommas(dataRowCount)} rows...`,
        );
    }

    console.log(`${callId} - Finished!`);

    return Ok({ totalRowCount: dataRowCount, categoryPath });
}

/**
 * For every sku in the spreadsheet, we try loading the existing catalog items.
 * This allows us to merge uploaded data with existing catalog data, and detect which rows have changed
 */
async function loadSpreadsheetAndCatalogItems(
    event: PublishCategorySpreadsheetEvent,
    callId: string,
): Promise<[PhysicalSpreadsheet | undefined, CoreCatalog[]]> {
    const buffer = await downloadS3Bucket(event.s3Path);

    const supplierSpreadsheet = XlsxSpreadsheet.isXlsx(buffer)
        ? XlsxSpreadsheet.fromBuffer(buffer)
        : new CsvSpreadsheet(buffer);

    await fanoutIfLargeSpreadsheetAndFanatics(supplierSpreadsheet?.numDataRows() ?? 0, event, callId);

    return [
        supplierSpreadsheet,
        await loadCatalogItemsFromMongo(
            event.supplierId,
            'sku',
            supplierSpreadsheet?.skus(event.fromRowIdx, event.toRowIdx) ?? [],
        ),
    ];
}

// Resolves just before the lambda would time out.  This allows us to send it back to the user over the socket
function timeoutPromise<T>(promise: Promise<T>, timeout: number): Promise<'timeout' | T> {
    return new Promise((resolve, reject) => {
        // Set up the timeout
        const timer = setTimeout(() => {
            resolve('timeout');
        }, timeout);

        // Set up the real work
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

function numberWithCommas(x: number): string {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
