import { CoreCatalog } from '@lib/core-catalog';
import { TinyWarehouse } from '@lib/requests';
import { DscoCatalogRow, DscoSpreadsheet } from '@lib/spreadsheet';
import { PhysicalSpreadsheetRow } from './physical-spreadsheet-row';

/**
 * A physical spreadsheet with row data that can be extracted and turned into catalog row information
 *
 * Currently only two physical sheets supported: Google spreadsheet and Xslx spreadsheet
 */
export abstract class PhysicalSpreadsheet {
    /**
     * Provides an iterator to read the rows from the sheet
     */
    abstract rows(startRowIdx?: number): IterableIterator<PhysicalSpreadsheetRow>;

    /**
     * Extracts the DscoCatalogRow information from the physical row data
     *
     * @param dscoSpreadsheet - Used to get column & validation information
     * @param supplierId - Supplier
     * @param retailerId - Retailer
     * @param categoryPath - Path to Category
     * @param existingCatalogItems - Used to merge some fields from existing catalog items (such as the images array)
     * @param warehouses - The supplier's warehouses
     * @param startRowIdx - Used to optionally skip some rows
     */
    *extractCatalogRows(
        dscoSpreadsheet: DscoSpreadsheet,
        supplierId: number,
        retailerId: number,
        categoryPath: string,
        existingCatalogItems: Record<string, CoreCatalog>,
        warehouses: TinyWarehouse[],
        startRowIdx?: number,
    ): IterableIterator<DscoCatalogRow> {
        for (const row of this.rows(startRowIdx)) {
            yield row.parseCatalogRow(
                dscoSpreadsheet,
                supplierId,
                retailerId,
                categoryPath,
                warehouses,
                existingCatalogItems,
            );
        }
    }
}
