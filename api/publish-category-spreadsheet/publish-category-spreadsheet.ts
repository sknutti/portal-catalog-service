import { apiWrapper, getUser } from '@dsco/service-utils';
import { keyBy, MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { DscoSpreadsheet, generateSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { catalogItemSearch } from '@lib/utils';
import { gunzip, inflate } from 'zlib';
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

    const catalogItems = await catalogItemSearch(supplierId, retailerId, categoryPath);

    const dscoSpreadsheet = await generateSpreadsheet(supplierId, retailerId, categoryPath);

    if (!(dscoSpreadsheet instanceof DscoSpreadsheet)) {
        return dscoSpreadsheet;
    }

    const excelSpreadsheet = XlsxSpreadsheet.fromBuffer(await gunzipAsync(gzippedFile));

    if (!excelSpreadsheet) {
        return {
            success: true,
            numEmptyRows: 0,
            numFailedRows: 0,
            numSuccessfulRows: 0,
            rowsWithErrors: {}
        };
    }

    // Pull the row data from the google spreadsheet
    const catalogRows = excelSpreadsheet.extractCatalogRows(dscoSpreadsheet, supplierId, retailerId, categoryPath, keyBy(catalogItems, 'sku'), event.body.startRowIdx);

    // Resolve the rows that were modified, giving progress updates
    const resolver = new CatalogResolver(supplierId, user.userId);

    let rowIdx = event.body.startRowIdx || 1; // 1 for the header row
    let numSuccessfulRows = 0;
    let numEmptyRows = 0;

    const resolvedCatalogBatcher = batch(catalogRows, 30, (row) => row.then((r) => resolver.resolveCatalogRow(r)));

    for (const resolvedCatalogBatch of resolvedCatalogBatcher) {
        for (const response of await Promise.all(resolvedCatalogBatch)) {
            if (response === 'success') {
                numSuccessfulRows++;
            } else if (response === 'empty') {
                numEmptyRows++;
            } else {
                return {
                    success: true,
                    numEmptyRows,
                    numSuccessfulRows,
                    rowWithError: rowIdx,
                    validationMessages: response
                };
            }

            rowIdx++;
        }
    }

    return {
        success: true,
        numSuccessfulRows,
        numEmptyRows
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

function *batch<T, U>(iterator: IterableIterator<T>, batchSize: number, mapper: (item: T) => U): Generator<U[]> {
    let result: U[] = [];

    for (const item of iterator) {
        result.push(mapper(item));

        if (result.length === batchSize) {
            yield result;
            result = [];
        }
    }

    if (result.length) {
        yield result;
    }
}
