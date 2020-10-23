// import { UnexpectedError } from '@dsco/ts-models';
// import { CoreCatalog } from '@lib/core-catalog';
// import { DDB_CLIENT, SpreadsheetDynamoTable, SpreadsheetRecord } from '@lib/spreadsheet';
// import { catalogItemSearch } from '@lib/utils';
//
// /**
//  * Loads the saved category spreadsheet, if any.
//  * If there is one, checks to see if the spreadsheet is "out of date" - meaning changes were made outside of the spreadsheet
//  */
// export async function verifyCategorySpreadsheet(categoryPath: string, supplierId: number, retailerId: number): Promise<VerifiedSpreadsheet> {
//     const [savedSheet, attributionActivationDate, catalogItems] = await Promise.all([
//         SpreadsheetDynamoTable.getItem(supplierId, retailerId, categoryPath),
//         getAttributionActivationDate(retailerId),
//         catalogItemSearch(supplierId, retailerId, categoryPath)
//     ]);
//
//     // Require there to be an active attribution
//     if (!attributionActivationDate) {
//         // TODO: Handle all of these unexpected errors
//         throw new UnexpectedError('No active catalog attributions for retailer', JSON.stringify({
//             categoryPath,
//             retailerId,
//             supplierId
//         }));
//     }
//
//     return {
//         savedSheet,
//         outOfDate: !!savedSheet && (
//           (savedSheet.scriptVersion !== APP_SCRIPT_VERSION)
//           || (savedSheet.lastUpdateDate < attributionActivationDate)
//           || !!catalogItems.find(item => item.last_update_date && new Date(item.last_update_date) > savedSheet.lastUpdateDate)
//         ),
//         catalogItems
//     };
// }
//
// export async function getAttributionActivationDate(retailerId: number): Promise<Date | undefined> {
//     const result = await DDB_CLIENT.getItem({
//         TableName: process.env.CURRENT_CATALOG_TABLE!,
//         AttributesToGet: ['activationDate'],
//         Key: {
//             accountId: {
//                 N: retailerId.toString()
//             }
//         }
//     }).promise();
//
//     return result.Item?.activationDate?.S ? new Date(result.Item.activationDate.S) : undefined;
// }
//
// export interface VerifiedSpreadsheet {
//     savedSheet?: SpreadsheetRecord;
//     outOfDate: boolean;
//     catalogItems: CoreCatalog[];
// }
