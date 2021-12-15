import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError, UnexpectedError } from '@dsco/ts-models';
import { getLeoAuthUserTable } from '@lib/environment';
import { DscoCatalogRow, DscoSpreadsheet, generateDscoSpreadsheet } from '@lib/spreadsheet';
import { xlsxFromDsco } from '@lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco';
import { catalogExceptionsItemSearch, gzipAsync } from '@lib/utils';
import { GenerateContentExceptionsSpreadsheetRequest } from './get-content-exceptions-spreadsheet.request';
import { CoreCatalog, CatalogContentCompliance } from '@lib/core-catalog';
import { PipelineErrorType } from '@dsco/ts-models';

export const getContentExceptionsSpreadsheet = apiWrapper<GenerateContentExceptionsSpreadsheetRequest>(
    async (event) => {
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

        console.log(`GCES Called with sid=${supplierId} rid=${retailerId} cpath=${categoryPath}`);

        const catalogExceptionItems: CoreCatalog[] = await catalogExceptionsItemSearch(
            supplierId,
            retailerId,
            categoryPath,
        );

        // if (!catalogExceptionItems[0].compliance) {
        //     catalogExceptionItems[0].compliance = {
        //         field_errors: [
        //             '1234:test__description__test__long desc test error__this is the first test error',
        //             '1234:test__description__test__long desc test error__this error also takes place on multiple lines',
        //             'this is a poorly formatted error that will be placed on the sku column',
        //         ],
        //     };
        // }

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

        //workbook.toFile(); // TODO test line only take out before committing

        return {
            success: true,
            gzippedFile: await gzipAsync(workbook.toBuffer()),
        };
    },
);
