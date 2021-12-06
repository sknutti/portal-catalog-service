import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { getLeoAuthUserTable } from '@lib/environment';
import { DscoCatalogRow, DscoSpreadsheet, generateDscoSpreadsheet } from '@lib/spreadsheet';
import { xlsxFromDsco } from '@lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco';
import { catalogExceptionsItemSearch, gzipAsync } from '@lib/utils';
import { GenerateContentExceptionsSpreadsheetRequest } from './get-content-exceptions-spreadsheet.request';
import { DscoColumn } from '@lib/spreadsheet/dsco-column';
import { CoreCatalog } from '@lib/core-catalog';
import { PipelineErrorType } from '@dsco/ts-models';

export const getContentExceptionsSpreadsheet = apiWrapper<GenerateContentExceptionsSpreadsheetRequest>(
    async (event) => {
        if (!event.body.categoryPath) {
            return new MissingRequiredFieldError('categoryPath');
        }
        // TODO CCR - Uncomment the below authorization steps as part of https://chb.atlassian.net/browse/CCR-111
        // if (!event.body.retailerId) {
        //     return new MissingRequiredFieldError('retailerId');
        // }

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

        // TODO CCR below function call returns dummy values, function call will likely need to take 3 parameters (https://chb.atlassian.net/browse/CCR-112)
        const catalogExceptionItems: CoreCatalog[] = await catalogExceptionsItemSearch(); //supplierId, retailerId, categoryPath);

        // TODO CCR (CCR-112) - replace below with: = await generateDscoSpreadsheet(supplierId, retailerId, categoryPath);
        const spreadsheet = new DscoSpreadsheet(`Catalog Exceptions ${categoryPath}`);

        // Add columns (Using generateDscoSpreadsheet(...) will automatically populate columns, so you can remove this loop when CCR-112 is ready)
        for (const colName of ['sku', 'longdescription']) {
            spreadsheet.addColumn(
                // Through trial and error I have determined:
                // 'core' serves as a flag that a given column is not in the extended_attributes
                // replacing 'core' with 'extended' will tell the lower-level functions to look for this column in the extended_attributes
                // Setting required: 'none' means values will not be inserted into the excel spreadsheet
                // Make sure you check out the interface DscoColValidation in dsco-column.ts to understand the validation input in this constructor
                new DscoColumn(colName, 'this will be a description', 'core', {
                    required: PipelineErrorType.info,
                    format: 'string',
                }),
            );
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
