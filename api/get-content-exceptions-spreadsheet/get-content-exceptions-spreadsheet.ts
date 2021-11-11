import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getLeoAuthUserTable } from '@lib/environment';
import { DscoCatalogRow, DscoSpreadsheet, generateDscoSpreadsheet } from '@lib/spreadsheet';
import { xlsxFromDsco } from '@lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco';
import { catalogItemSearch, gzipAsync } from '@lib/utils';
import { GenerateContentExceptionsSpreadsheetRequest } from './get-content-exceptions-spreadsheet.request';
import { XlsxSpreadsheet } from '@lib/spreadsheet';
import * as XLSX from '@sheet/image';
import { CellObject, Comments, DataValidation, Style, utils, WorkSheet } from '@sheet/image';
import { DscoColumn } from '@lib/spreadsheet/dsco-column';

export const getContentExceptionsSpreadsheet = apiWrapper<GenerateContentExceptionsSpreadsheetRequest>(
    async (event) => {
        console.log('In content exceptions spreadsheet request!');
        console.log(JSON.stringify(event));
        console.log(`The specified category path is ${event.body.categoryPath}`);

        // if (!event.body.retailerId) {
        //     return new MissingRequiredFieldError('retailerId');
        // }
        // if (!event.body.categoryPath) {
        //     return new MissingRequiredFieldError('categoryPath');
        // }

        // const user = await getUser(event.requestContext, getLeoAuthUserTable());

        // Must be logged in
        // if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        //     return new UnauthorizedError();
        // }

        // const supplierId = user.accountId;
        // const { retailerId, categoryPath } = event.body;

        // const catalogItems = await catalogItemSearch(supplierId, retailerId, categoryPath);

        // const spreadsheet = await generateDscoSpreadsheet(supplierId, retailerId, categoryPath);

        // if (!(spreadsheet instanceof DscoSpreadsheet)) {
        //     return spreadsheet;
        // }

        // for (const catalog of catalogItems) {
        //     // Populate the spreadsheet with all of their catalog items
        //     spreadsheet.addCatalogRow(new DscoCatalogRow(catalog, false, false));
        // }

        const spreadsheet = new DscoSpreadsheet('ccr test');
        const myCol = new DscoColumn('sku', 'description', 'core', {
            required: 'none',
        });
        spreadsheet.addColumn(myCol);
        const workbook = xlsxFromDsco(spreadsheet, 123456);

        return {
            success: true,
            gzippedFile: await gzipAsync(workbook.toBuffer()),
        };
    },
);
