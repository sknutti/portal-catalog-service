import { CoreCatalog } from '@lib/core-catalog';

/**
 * Represents one row's data in the dsco spreadsheet
 *
 * Can be extracted from a PhysicalSpreadsheet, and added to a DscoSpreadsheet.
 */
export class DscoCatalogRow {
    /**
     * @param catalog - The catalog the row represents
     * @param modified - If the catalog has been modified with respect to what's in dsco
     * @param emptyRow - If the entire row is empty
     */
    constructor(public catalog: CoreCatalog, public modified: boolean, public emptyRow: boolean = false) {}
}
