import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getLeoAuthUserTable, getPortalCatalogS3BucketName } from '@lib/environment';
import { createCatalogItemS3DownloadPath, getSignedS3DownloadUrl, writeS3Object } from '@lib/s3';
import { DscoCatalogRow, DscoSpreadsheet, generateDscoSpreadsheet } from '@lib/spreadsheet';
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

    const user = await getUser(event.requestContext, getLeoAuthUserTable());

    // Must be logged in
    if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
        return new UnauthorizedError();
    }

    const supplierId = user.accountId;
    const { retailerId, categoryPath } = event.body;

    const catalogItems = await catalogItemSearch(supplierId, retailerId, categoryPath);

    const spreadsheet = await generateDscoSpreadsheet(supplierId, retailerId, categoryPath);

    if (!(spreadsheet instanceof DscoSpreadsheet)) {
        return spreadsheet;
    }

    for (const catalog of catalogItems) {
        // Populate the spreadsheet with all of their catalog items
        spreadsheet.addCatalogRow(new DscoCatalogRow(catalog, false, false));
    }

    const workbook = xlsxFromDsco(spreadsheet, retailerId);

    const downloadPath = createCatalogItemS3DownloadPath(supplierId, retailerId, user.userId, categoryPath);
    await writeS3Object(getPortalCatalogS3BucketName(), downloadPath, workbook.toBuffer());

    return {
        success: true,
        downloadUrl: await getSignedS3DownloadUrl(downloadPath, `Catalog Spreadsheet - ${getLastCategoryPath(categoryPath)}.xlsx`)
    };
});

function getLastCategoryPath(fullCategoryPath: string): string {
    const split = fullCategoryPath.split('||');
    return split[split.length - 1];
}
