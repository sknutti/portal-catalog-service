import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError, UnexpectedError } from '@dsco/ts-models';
import { getLeoAuthUserTable, getPortalCatalogS3BucketName } from '@lib/environment';
import { createCatalogItemS3DownloadPath, getSignedS3DownloadUrl, writeS3Object } from '@lib/s3';
import { DscoCatalogRow, DscoSpreadsheet, generateDscoSpreadsheet } from '@lib/spreadsheet';
import { xlsxFromDsco } from '@lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco';
import { catalogExceptionsItemSearch } from '@lib/utils';
import { GenerateCatalogExceptionsSpreadsheetRequest } from './get-content-exceptions-spreadsheet.request';
import { CoreCatalog } from '@lib/core-catalog';

export const generateCatalogExceptionsSpreadsheet = apiWrapper<GenerateCatalogExceptionsSpreadsheetRequest>(
    async (event: any) => {
        if (!event.body.categoryPath) {
            return new MissingRequiredFieldError('categoryPath');
        }
        if (!event.body.retailerId) {
            return new MissingRequiredFieldError('retailerId');
        }
        const { retailerId, categoryPath } = event.body;

        // Must be logged in
        // TODO CCR - this only works if user is logged in as a supplier, adding support for retailers as part of:
        // https://chb.atlassian.net/browse/CCR-133
        const user = await getUser(event.requestContext, getLeoAuthUserTable());
        if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
            return new UnauthorizedError();
        }
        const supplierId = user.accountId;

        console.log(
            `generateCatalogExceptionsSpreadsheet called with: sid=${supplierId} rid=${retailerId} cpath=${categoryPath}`,
        );

        const catalogExceptionItems: CoreCatalog[] = await catalogExceptionsItemSearch(
            supplierId,
            retailerId,
            categoryPath,
        );

        const spreadsheet: UnexpectedError | DscoSpreadsheet = await generateDscoSpreadsheet(
            supplierId,
            retailerId,
            categoryPath,
        );
        if (spreadsheet instanceof UnexpectedError) {
            return spreadsheet;
        }

        for (const catalogItem of catalogExceptionItems) {
            spreadsheet.addCatalogRow(new DscoCatalogRow(catalogItem, false, false));
        }

        const workbook = xlsxFromDsco(spreadsheet, retailerId);

        const downloadPath = createCatalogItemS3DownloadPath(supplierId, retailerId, user.userId, categoryPath);
        await writeS3Object(getPortalCatalogS3BucketName(), downloadPath, workbook.toBuffer());

        return {
            success: true,
            downloadUrl: await getSignedS3DownloadUrl(
                downloadPath,
                `Catalog Exceptions - ${getLastCategoryPath(categoryPath)}.xlsx`,
            ),
        };
    },
);

function getLastCategoryPath(fullCategoryPath: string): string {
    const split = fullCategoryPath.split('||');
    return split[split.length - 1];
}
