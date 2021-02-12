import { CatalogResolver } from '@bot/publish-category-spreadsheet/catalog-resolver';
import { keyBy, UnexpectedError } from '@dsco/ts-models';
import { DscoSpreadsheet, generateSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { catalogItemSearch, randomFloat, WarehousesLoader } from '@lib/utils';
import { batch, collect, enumerate, filter, map } from '@lib/utils/iter-tools';
import { sendWebsocketEvent } from '@lib/utils/send-websocket-event';
import { Err, Ok, Result } from 'ts-results';
import { gunzip } from 'zlib';
import { CatalogSpreadsheetWebsocketEvents } from '../../api';

export interface PublishCategorySpreadsheetEvent {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
    gzippedFile: string;
    skippedRowIndexes?: number[]
}


export async function publishCategorySpreadsheet(event: PublishCategorySpreadsheetEvent): Promise<void> {
    try {
        const resp = await Promise.race([publishSpreadsheetImpl(event), timeout()] as const);
        if (resp === 'timeout') {
            await sendWebsocketEvent('error', {
                error: null,
                message: 'Response timed out',
                categoryPath: event.categoryPath
            }, event.supplierId);
        } else if (resp.ok) {
            await sendWebsocketEvent('success', resp.val, event.supplierId);
        } else {
            await sendWebsocketEvent('error', {
                error: resp.val,
                message: resp.val.message,
                categoryPath: event.categoryPath
            }, event.supplierId);
        }
    } catch (error: any) {
        await sendWebsocketEvent('error', {
            error,
            message: 'message' in error ? error.message : 'Unexpected error',
            categoryPath: event.categoryPath
        }, event.supplierId);
    }
}

async function publishSpreadsheetImpl(
  {categoryPath, retailerId, supplierId, userId, gzippedFile, skippedRowIndexes}: PublishCategorySpreadsheetEvent
): Promise<Result<CatalogSpreadsheetWebsocketEvents['success'], UnexpectedError>> {
    const sendProgress = (progress: number, message: string) => {
        return sendWebsocketEvent('progressUpdate', {progress, message, categoryPath}, supplierId);
    };

    await sendProgress(0.34, 'Parsing Spreadsheet...');

    const [catalogItems, dscoSpreadsheet, warehouses, unzippedSpreadsheet] = await Promise.all([
        catalogItemSearch(supplierId, retailerId, categoryPath),
        generateSpreadsheet(supplierId, retailerId, categoryPath),
        WarehousesLoader.loadWarehouses(supplierId),
        gunzipAsync(gzippedFile)
    ] as const);

    if (!(dscoSpreadsheet instanceof DscoSpreadsheet)) {
        return Err(dscoSpreadsheet);
    }

    const excelSpreadsheet = XlsxSpreadsheet.fromBuffer(unzippedSpreadsheet);

    if (!excelSpreadsheet) {
        return Ok({
            totalRowCount: 0,
            categoryPath
        });
    }

    // Pull the row data from the google spreadsheet
    const catalogRows = excelSpreadsheet.extractCatalogRows(dscoSpreadsheet, supplierId, retailerId, categoryPath,
      keyBy(catalogItems, 'sku'), warehouses);


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

    const batchSize = 30;
    const startValidationPct = randomFloat(0.45, 0.55);

    // Save the rows in batches, collecting them to get the gearman requests running in parallel, even though we process them sequentially
    const resolvedBatches = collect(map(batch(rowsToSave, batchSize), rows => resolver.resolveBatch(rows)));

    await sendProgress(startValidationPct, `Validating ${remainingRowsToValidate} rows...`);

    for await (const resolvedBatchError of resolvedBatches) {
        if (resolvedBatchError) {
            return Ok({
                totalRowCount,
                validationMessages: resolvedBatchError.messages,
                rowWithError: resolvedBatchError.rowIdx,
                categoryPath
            });
        } else {
            remainingRowsToValidate -= batchSize;

            // Can happen if skipped rows.
            if (remainingRowsToValidate < 0) {
                remainingRowsToValidate = 0;
            }
            const validationPct = (totalRowCount - remainingRowsToValidate) / totalRowCount;

            await sendProgress(
              ((1 - startValidationPct) * validationPct) + startValidationPct,
              `Validating ${numberWithCommas(remainingRowsToValidate)} rows...`
            );
        }
    }

    return Ok({totalRowCount, categoryPath});
}

// Purposely 10 seconds before actual timeout
const LAMBDA_TIMEOUT = 230 * 1_000;

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
