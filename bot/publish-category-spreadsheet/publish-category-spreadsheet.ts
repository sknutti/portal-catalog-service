import { CatalogResolver } from '@bot/publish-category-spreadsheet/catalog-resolver';
import { keyBy, keyWith, UnexpectedError } from '@dsco/ts-models';
import { CoreCatalog, MINIMAL_CORE_CATALOG_PROJECTION, MinimalCoreCatalog } from '@lib/core-catalog';
import {
    CatalogSpreadsheetS3Metadata,
    downloadS3Bucket,
    downloadS3Metadata,
    parseCatalogItemS3UploadUrl
} from '@lib/s3';
import { DscoSpreadsheet, generateSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { catalogItemSearch, gzipAsync, randomFloat, WarehousesLoader } from '@lib/utils';
import { batch, collect, enumerate, filter, map } from '@lib/utils/iter-tools';
import { sendWebsocketEvent } from '@lib/utils/send-websocket-event';
import type { S3CreateEvent } from 'aws-lambda';
import { Err, Ok, Result } from 'ts-results';
import { gunzip } from 'zlib';
import { CatalogSpreadsheetWebsocketEvents } from '../../api';

export interface PublishCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
    gzippedFile?: string;
    s3Path?: string;
    skippedRowIndexes?: number[];
}

export async function publishCategorySpreadsheet(event: PublishCategorySpreadsheetEvent | S3CreateEvent): Promise<void> {
    if (!('supplierId' in event)){
        event = await getEventFromS3(event);
        console.log('Publish event extracted from s3 metadata: ', event);
    }

    try {
        const resp = await Promise.race([publishSpreadsheetImpl(event), timeout()] as const);
        if (resp === 'timeout') {
            throw new Error('Timeout occurred publishing spreadsheet.');
        } else if (resp.ok) {
            await sendWebsocketEvent('success', resp.val, event.supplierId);
        } else {
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

    const s3Path = createEvent.Records[0].s3.object.key;
    const meta = await downloadS3Metadata<CatalogSpreadsheetS3Metadata>(s3Path);
    const skippedRowIndexes = meta.skipped_row_indexes?.split(',').map(parseInt).filter(idx => !isNaN(idx));

    const parsed = parseCatalogItemS3UploadUrl(createEvent.Records[0].s3.object.key);
    if (parsed === 'error') {
        throw new Error(`Failed parsing catalog s3 metadata. Url: ${createEvent.Records[0].s3.object.key}`);
    }
    const {supplierId, retailerId, userId} = parsed;

    return {
        s3Path,
        skippedRowIndexes,
        supplierId,
        retailerId,
        userId,
        categoryPath: meta.category_path
    };
}

async function publishSpreadsheetImpl({
    categoryPath,
    retailerId,
    supplierId,
    userId,
    gzippedFile,
    s3Path,
    skippedRowIndexes,
}: PublishCategorySpreadsheetEvent): Promise<Result<CatalogSpreadsheetWebsocketEvents['success'], UnexpectedError>> {
    const sendProgress = (progress: number, message: string) => {
        return sendWebsocketEvent('progressUpdate', { progress, message, categoryPath }, supplierId);
    };

    const [, dscoSpreadsheet, warehouses, [excelSpreadsheet, existingCatalogItems]] = await Promise.all([
        sendProgress(0.34, 'Parsing Spreadsheet...'),
        generateSpreadsheet(supplierId, retailerId, categoryPath),
        WarehousesLoader.loadWarehouses(supplierId),
        loadSpreadsheetAndCatalogItems(categoryPath, userId, supplierId, retailerId, gzippedFile, s3Path),
    ] as const);

    if (!(dscoSpreadsheet instanceof DscoSpreadsheet)) {
        return Err(dscoSpreadsheet);
    }

    if (!excelSpreadsheet) {
        return Ok({
            totalRowCount: 0,
            categoryPath,
        });
    }

    // Pull the row data from the google spreadsheet
    const catalogRows = excelSpreadsheet.extractCatalogRows(
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

    const totalRowCount = excelSpreadsheet.numDataRows();
    let remainingRowsToValidate = totalRowCount;

    // Enumerate all of the rows starting at 1 for the header.  Then filter out the skipped rows, rows without data, and unmodified rows
    const rowsToSave = filter(enumerate(catalogRows, 1), ([row, rowIdx]) => {
        const needsSave = !row.emptyRow && row.modified && !skippedRows.has(rowIdx);

        if (!needsSave) {
            remainingRowsToValidate -= 1;
        }

        return needsSave;
    });

    const batchSize = 5;
    const startValidationPct = randomFloat(0.45, 0.55);

    // Save the rows in batches, collecting them to get the gearman requests running in parallel, even though we process them sequentially
    const resolvedBatches = collect(map(batch(rowsToSave, batchSize), (rows) => resolver.resolveBatch(rows)));

    await sendProgress(startValidationPct, `Validating ${remainingRowsToValidate} rows...`);

    for await (const resolvedBatchError of resolvedBatches) {
        if (resolvedBatchError) {
            return Ok({
                totalRowCount,
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
            const validationPct = (totalRowCount - remainingRowsToValidate) / totalRowCount;

            await sendProgress(
                (1 - startValidationPct) * validationPct + startValidationPct,
                `Validating ${numberWithCommas(remainingRowsToValidate)} rows...`,
            );
        }
    }

    return Ok({ totalRowCount, categoryPath });
}

/**
 * For every sku in the spreadsheet, we try loading the existing catalog items.  This allows us to merge uploaded data with existing catalog data
 */
async function loadSpreadsheetAndCatalogItems(categoryPath: string, userId: number, supplierId: number, retailerId: number, gzippedFile?: string, s3Path?: string): Promise<[XlsxSpreadsheet | undefined, MinimalCoreCatalog[]]> {
    let buffer;
    if (gzippedFile) {
        buffer = await gunzipAsync(gzippedFile);
    } else if (s3Path) {
        buffer = await downloadS3Bucket(s3Path);
    } else {
        throw new Error('Missing upload body');
    }

    const excelSpreadsheet = XlsxSpreadsheet.fromBuffer(buffer);

    return [
        excelSpreadsheet,
        await catalogItemSearch<MinimalCoreCatalog>(supplierId, retailerId, categoryPath, MINIMAL_CORE_CATALOG_PROJECTION, excelSpreadsheet?.skus()),
    ];
}

// Purposely 10 seconds before actual timeout
const LAMBDA_TIMEOUT = 890 * 1_000;

// Resolves just before the lambda would time out.  This allows us to send it back to the user over the socket
function timeout(): Promise<'timeout'> {
    return new Promise((resolve) => {
        setTimeout(() => resolve('timeout'), LAMBDA_TIMEOUT);
    });
}

function gunzipAsync(text: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        gunzip(Buffer.from(text, 'binary'), (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

function numberWithCommas(x: number): string {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
