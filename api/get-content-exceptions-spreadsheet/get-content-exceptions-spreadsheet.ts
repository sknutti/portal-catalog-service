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

export const getContentExceptionsSpreadsheet = apiWrapper<GenerateContentExceptionsSpreadsheetRequest>(
    async (event) => {
        console.log('In content exceptions spreadsheet request!');
        console.log(JSON.stringify(event));

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

        // mostly pulled from lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco.ts
        // and api/generate-category-spreadsheet/generate-category-spreadsheet.ts
        const xlsxbook = utils.book_new();

        const sheet: WorkSheet = {
            '!ref': utils.encode_range({
                s: { c: 0, r: 0 },
                e: { c: 3, r: 4 },
            }),
            '!condfmt': [],
            '!validations': [],
        };

        // var comment_part = {
        //     a: 'CommerceHub',
        //     R: [
        //         { t: 's', v: 'plain text ' },
        //         { t: 's', v: 'bold text ', s: { bold: true } },
        //     ],
        // };
        // var comment = [];
        // comment.push(comment_part);
        //comment['!pos'] = { c: 3 /* "D" */, r: 4 /* "5" */, w: 100, h: 100 };
        // comment.s = { fgColor: { rgb: 'FFFF00' } };

        // XLSX.utils.sheet_add_aoa(sheet, [['abc']], { origin: 'C3' }); // aoa stands for 'array of arrays'
        // sheet['B2'].c = comment; // attaches the comment to cell B2

        const workbook = new XlsxSpreadsheet(xlsxbook, sheet);

        return {
            success: true,
            gzippedFile: await gzipAsync(workbook.toBuffer()),
        };
    },
);
