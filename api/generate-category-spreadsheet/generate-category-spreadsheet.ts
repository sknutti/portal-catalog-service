import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { DscoCatalogRow, DscoSpreadsheet, generateSpreadsheet } from '@lib/spreadsheet';
import { xlsxFromDsco } from '@lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco';
import { catalogItemSearch, gzipAsync } from '@lib/utils';
import { GenerateCategorySpreadsheetRequest } from './generate-category-spreadsheet.request';

export const generateCategorySpreadsheet = apiWrapper<GenerateCategorySpreadsheetRequest>(async (event) => {
    if (!event.body.retailerId) {
        return new MissingRequiredFieldError('retailerId');
    }
    if (!event.body.categoryPath) {
        return new MissingRequiredFieldError('categoryPath');
    }

    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const supplierId = user.accountId;
    const { retailerId, categoryPath } = event.body;

    const catalogItems = await catalogItemSearch(supplierId, retailerId, categoryPath);

    const spreadsheet = await generateSpreadsheet(supplierId, retailerId, categoryPath);

    if (!(spreadsheet instanceof DscoSpreadsheet)) {
        return spreadsheet;
    }

    for (const catalog of catalogItems) {
        // Populate the spreadsheet with all of their catalog items
        spreadsheet.addCatalogRow(new DscoCatalogRow(catalog, false, true));
    }

    const workbook = xlsxFromDsco(spreadsheet, retailerId);

    return {
        success: true,
        gzippedFile: await gzipAsync(workbook.toBuffer()),
    };
});
