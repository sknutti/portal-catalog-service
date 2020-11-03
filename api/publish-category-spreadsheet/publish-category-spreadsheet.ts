import { apiWrapper, getUser } from '@dsco/service-utils';
import { keyBy, MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { DscoSpreadsheet, generateSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { catalogItemSearch, WarehousesLoader } from '@lib/utils';
import { batch, collect, enumerate, filter, map } from '@lib/utils/iter-tools';
import { gunzip } from 'zlib';
import { CatalogResolver } from './catalog-resolver';
import { PublishCategorySpreadsheetRequest } from './publish-category-spreadsheet.request';

export const publishCategorySpreadsheet = apiWrapper<PublishCategorySpreadsheetRequest>(async event => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    if (!event.body.categoryPath) {
        return new MissingRequiredFieldError('categoryPath');
    }
    if (!event.body.gzippedFile) {
        return new MissingRequiredFieldError(('gzippedFile'));
    }

    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const supplierId = user.accountId;
    const {retailerId, categoryPath, gzippedFile} = event.body;

    const [catalogItems, dscoSpreadsheet, warehouses, unzippedSpreadsheet] = await Promise.all([
        catalogItemSearch(supplierId, retailerId, categoryPath),
        generateSpreadsheet(supplierId, retailerId, categoryPath),
        WarehousesLoader.loadWarehouses(supplierId),
        gunzipAsync(gzippedFile)
    ] as const);

    if (!(dscoSpreadsheet instanceof DscoSpreadsheet)) {
        return dscoSpreadsheet;
    }

    const excelSpreadsheet = XlsxSpreadsheet.fromBuffer(unzippedSpreadsheet);

    if (!excelSpreadsheet) {
        return {
            success: true,
            totalRowCount: 0
        };
    }

    // Pull the row data from the google spreadsheet
    const catalogRows = excelSpreadsheet.extractCatalogRows(dscoSpreadsheet, supplierId, retailerId, categoryPath,
        keyBy(catalogItems, 'sku'), warehouses);

    // Resolve the rows that were modified, giving progress updates
    const resolver = new CatalogResolver(supplierId, user.userId, new Set(event.body.skippedRowIndexes));

    const skippedRows = new Set(event.body.skippedRowIndexes);

    // Enumerate all of the rows starting at 1 for the header.  Then filter out the skipped rows, rows without data, and unmodified rows
    const rowsToSave = filter(enumerate(catalogRows, 1), ([row, rowIdx]) => !row.emptyRow && row.modified && !skippedRows.has(rowIdx));

    // Save the rows in batches, collecting them to get the gearman requests running in parallel, even though we process them sequentially
    const resolvedBatches = collect(map(batch(rowsToSave, 30), rows => resolver.resolveBatch(rows)));

    for await (const resolvedBatchError of resolvedBatches) {
        if (resolvedBatchError) {
            return {
                success: true,
                totalRowCount: excelSpreadsheet.numDataRows(),
                validationMessages: resolvedBatchError.messages,
                rowWithError: resolvedBatchError.rowIdx
            };
        }
    }

    return {
        success: true,
        totalRowCount: excelSpreadsheet.numDataRows()
    };
});

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
