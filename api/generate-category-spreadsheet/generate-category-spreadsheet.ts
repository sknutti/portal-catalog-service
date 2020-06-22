import { apiWrapper, getUser } from '@dsco/service-utils';
import { MissingRequiredFieldError, UnauthorizedError } from '@dsco/ts-models';
import { DscoSpreadsheet } from '../../lib/dsco-spreadsheet';
import { generateSpreadsheet } from '../../lib/generate-spreadsheet';
import { prepareGoogleApis } from '../../lib/google-api-utils';
import { SpreadsheetDynamoTable } from '../../lib/spreadsheet-dynamo-table';
import { GenerateCategorySpreadsheetRequest } from './generate-category-spreadsheet.request';

const spreadsheetDynamoTable = new SpreadsheetDynamoTable();

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

    const existing = await spreadsheetDynamoTable.getItem(user.accountId, event.body.retailerId, event.body.categoryPath);
    if (existing) {
        return {
            success: true,
            url: DscoSpreadsheet.generateUrl(existing.spreadsheetId)
        };
    }

    const spreadsheetOrError = await generateSpreadsheet(user.accountId, event.body.retailerId, event.body.categoryPath);

    if (!(spreadsheetOrError instanceof DscoSpreadsheet)) {
        return spreadsheetOrError;
    }

    const {sheets, drive, cleanupGoogleApis} = await prepareGoogleApis();

    const spreadsheetId = await spreadsheetOrError.createSpreadsheet(sheets, drive);
    await spreadsheetDynamoTable.putItem({
        spreadsheetId,
        categoryPath: event.body.categoryPath,
        retailerId: event.body.retailerId,
        supplierId: user.accountId
    });

    await cleanupGoogleApis();

    return {
        success: true,
        url: DscoSpreadsheet.generateUrl(spreadsheetId)
    };
});
