import { CoreCatalog } from '@lib/core-catalog';

/**
 * Represents one row's data in the dsco spreadsheet
 *
 * Can be extracted from a PhysicalSpreadsheet, and added to a DscoSpreadsheet.
 */
export class DscoCatalogRow {
    /**
     * @param catalog The catalog the row represents
     * @param modified if the catalog has been modified
     * @param savedToDsco If the catalog has been saved to dsco
     * @param emptyRow If the entire row is empty
     */
    constructor(public catalog: CoreCatalog, public modified: boolean, public savedToDsco: boolean, public emptyRow: boolean = false) {
    }
}
