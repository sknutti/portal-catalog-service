import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError, UnexpectedError } from '@dsco/ts-models';
import { getLeoAuthUserTable } from '@lib/environment';
import { DscoCatalogRow, DscoSpreadsheet, generateDscoSpreadsheet } from '@lib/spreadsheet';
import { xlsxFromDsco } from '@lib/spreadsheet/physical-spreadsheet/xlsx-from-dsco';
import { catalogExceptionsItemSearch, gzipAsync } from '@lib/utils';
import { GenerateContentExceptionsSpreadsheetRequest } from './get-content-exceptions-spreadsheet.request';
import { DscoColumn } from '@lib/spreadsheet/dsco-column';
import { CoreCatalog } from '@lib/core-catalog';
import { PipelineErrorType } from '@dsco/ts-models';

import * as AWS from 'aws-sdk';

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
        const user = await getUser(event.requestContext, getLeoAuthUserTable());
        if (!user?.accountId || !user.retailerIds?.includes(event.body.retailerId)) {
            return new UnauthorizedError();
        }
        const supplierId = user.accountId;

        console.log(`GCES Called with sid=${supplierId} rid=${retailerId} cpath=${categoryPath}`);
        console.log(`Valid rids:\n${JSON.stringify(user.retailerIds, null, 4)}`);
        console.log(`Got AWS creds:\n${JSON.stringify(AWS.config.credentials, null, 4)}`);

        // Still using test data
        const catalogExceptionItems: CoreCatalog[] = await catalogExceptionsItemSearch(
            supplierId,
            retailerId,
            categoryPath,
        );

        // TODO CCR (CCR-112) - replace below with: = await generateDscoSpreadsheet(supplierId, retailerId, categoryPath);
        // const spreadsheet = new DscoSpreadsheet(`Catalog Exceptions ${categoryPath}`);

        const spreadsheet = await generateDscoSpreadsheet(supplierId, retailerId, categoryPath);
        console.log('Got file or error back...');
        if (spreadsheet instanceof UnexpectedError) {
            console.log('The file generator returned an error');
            return spreadsheet;
        }
        console.log('File was OK.');

        /*
        // Add columns (Using generateDscoSpreadsheet(...) will automatically populate columns, so you can remove this loop when CCR-112 is ready)
        for (const colName of ['sku', 'long_description']) {
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
		*/

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
