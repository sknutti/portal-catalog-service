import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getLeoAuthUserTable } from '@lib/environment';
import { DscoCatalogRow, DscoSpreadsheet, generateDscoSpreadsheet } from '@lib/spreadsheet';
import { xlsxFromDsco } from '@lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco';
import { catalogExceptionsItemSearch, gzipAsync } from '@lib/utils';
import { GenerateContentExceptionsSpreadsheetRequest } from './get-content-exceptions-spreadsheet.request';
import { XlsxSpreadsheet } from '@lib/spreadsheet';
import * as XLSX from '@sheet/image';
import { CellObject, Comments, DataValidation, Style, utils, WorkSheet } from '@sheet/image';
import { DscoColumn } from '@lib/spreadsheet/dsco-column';
import { CoreCatalog } from '@lib/core-catalog';

export const getContentExceptionsSpreadsheet = apiWrapper<GenerateContentExceptionsSpreadsheetRequest>(
    async (event) => {
        console.log('In content exceptions spreadsheet request!');
        console.log(JSON.stringify(event));
        console.log(`The specified category path is ${event.body.categoryPath}`);

        // if (!event.body.retailerId) {
        //     return new MissingRequiredFieldError('retailerId');
        // }
        if (!event.body.categoryPath) {
            return new MissingRequiredFieldError('categoryPath');
        }

        // const user = await getUser(event.requestContext, getLeoAuthUserTable());

        // Must be logged in
        // if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        //     return new UnauthorizedError();
        // }

        // const spreadsheet = await generateDscoSpreadsheet(supplierId, retailerId, categoryPath);

        // if (!(spreadsheet instanceof DscoSpreadsheet)) {
        //     return spreadsheet;
        // }

        const supplierId = 654321; // Placeholder, replace with user.accountId ?
        const categoryPath = event.body.categoryPath;
        const retailerId = 123456; // Placeholder, replace with event.body.retailerId

        // TODO CCR below function call returns dummy values, function call will likely need to take 3 parameters
        const catalogExceptionItems: CoreCatalog[] = await catalogExceptionsItemSearch(); //supplierId, retailerId, categoryPath);

        const spreadsheet = new DscoSpreadsheet(`Catalog Exceptions ${categoryPath}`);

        // Populate spreadsheet with rows of data
        for (const catalogItem of catalogExceptionItems) {
            spreadsheet.addCatalogRow(new DscoCatalogRow(catalogItem, false, false));
        }

        // Columns should be added after rows
        for (const colName of ['sku', 'long_description']) {
            spreadsheet.addColumn(
                new DscoColumn(colName, 'this will be a description', 'core', {
                    required: 'none',
                }),
            );
        }

        const workbook = xlsxFromDsco(spreadsheet, retailerId);

        //workbook.toFile(); // TODO test line only take out before committing

        return {
            success: true,
            gzippedFile: await gzipAsync(workbook.toBuffer()),
        };
    },
);
