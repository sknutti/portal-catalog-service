import { DsError, ProductStatus } from '@dsco/ts-models';
import { CoreCatalog, createCoreCatalog } from '@lib/core-catalog';
import { GetWarehousesGearmanApi, GetWarehousesGearmanResponse } from '@lib/requests';
import { DscoSpreadsheet, GoogleSpreadsheet } from '@lib/spreadsheet';
import { sheets_v4 } from 'googleapis';
import Schema$CellData = sheets_v4.Schema$CellData;

/**
 * Represent's one row's data:
 * • A catalog
 * • If the catalog has been modified
 * • If the catalog has been saved to dsco
 * • If the entire row is empty
 *
 * Can be extracted from a GoogleSpreadsheet, and added to a DscoSpreadsheet.
 */
export class DscoCatalogRow {
    constructor(public catalog: CoreCatalog, public modified: boolean, public savedToDsco: boolean, public emptyRow: boolean = false) {
    }

    /**
     * Parses the google spreadsheet, turning it into DscoCatalogRow data using the columns from the dscoSpreadsheet
     *
     * @returns the parsed DscoCatalogRows
     */
    static async fromExistingSheet(
      googleSpreadsheet: GoogleSpreadsheet,
      dscoSpreadsheet: DscoSpreadsheet,
      supplierId: number,
      retailerId: number,
      categoryPath: string,
      existingCatalogItems: Record<string, CoreCatalog>
    ): Promise<DscoCatalogRow[]> {
        const {userSheetRowData, modifiedRowIndexes, columnSaveNames} = googleSpreadsheet;

        const parser = new CatalogRowParser(dscoSpreadsheet, modifiedRowIndexes, columnSaveNames,
          supplierId, retailerId, categoryPath, existingCatalogItems);


        const result: Array<Promise<DscoCatalogRow>> = [];
        for (let rowIdx = 1; rowIdx < userSheetRowData.length; rowIdx++) { // Start at 1 to skip the header row
            const row = userSheetRowData[rowIdx]?.values || [];

            result.push(parser.parse(row, rowIdx));
        }

        return Promise.all(result);
    }
}


/**
 * Parses a row in a GoogleSpreadsheet, turning it into a DscoCatalogRow
 */
class CatalogRowParser {
    private warehousesPromise?: Promise<GetWarehousesGearmanResponse | DsError>;

    constructor(
      private dscoSpreadsheet: DscoSpreadsheet,
      private modifiedRowIndexes: Set<number>,
      private columnSaveNames: string[],
      private supplierId: number,
      private retailerId: number,
      private categoryPath: string,
      private existingCatalogItems: Record<string, CoreCatalog>
    ) {

    }

    /**
     * Parses the given row, turning it into a DscoCatalogRow.
     * Async because we may need to load all of the supplier's warehouses to populate warehouse_quantity values
     */
    async parse(row: Schema$CellData[], rowIdx: number): Promise<DscoCatalogRow> {
        const {catalog} = createCoreCatalog(this.supplierId, this.retailerId, this.categoryPath);

        let filledFromExisting = false;
        let hasExistingItem = false;
        let emptyRow = true;
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const cell = row[colIdx];
            const colSaveName = this.columnSaveNames[colIdx];
            const dscoCol = this.dscoSpreadsheet.columnsBySaveName[colSaveName];
            if (!dscoCol) {
                continue;
            }

            if (dscoCol.readDataFromExistingCell(cell, catalog, this.retailerId) === 'hasValue') {
                emptyRow = false;
            }

            // Fill any necessary info from the existing catalog item as soon as we have a sku
            if (!filledFromExisting && catalog.sku) {
                filledFromExisting = true;
                const existingItem = this.existingCatalogItems[catalog.sku];
                hasExistingItem = !!existingItem;

                await this.fillCatalogFromExisting(catalog, existingItem);
            }
        }

        return new DscoCatalogRow(catalog, this.modifiedRowIndexes.has(rowIdx), hasExistingItem, emptyRow);
    }

    /**
     * Some data isn't in the spreadsheet, but needs to be there when saving.
     * This function copies that data from the existing catalog, or gives default values.
     */
    private async fillCatalogFromExisting(catalog: CoreCatalog, existing?: CoreCatalog): Promise<void> {
        // If they change the product status to anything but pending,
        // we must have both quantity_available and warehouses quantity.  This gives defaults of zero to both
        if (catalog.product_status !== ProductStatus.PENDING && (!existing || existing.product_status === ProductStatus.PENDING)) {
            catalog.quantity_available = existing?.quantity_available || 0;

            await this.handleWarehouseQuantity(catalog, existing);
        }

        // For every column in the spreadsheet that is an image, we need to be sure to copy that column's images array.
        // Otherwise, we would lose images for other retailers or categories.
        if (existing) {
            for (const imageColumn of this.dscoSpreadsheet.imageColumns) {
                const arrayNameToCopy = imageColumn.imageNames[0];
                catalog[arrayNameToCopy] = existing[arrayNameToCopy] || [];
            }
        }
    }

    /**
     * Sets the appropriate default warehouse_quantity values for all of the supplier's warehouses.
     *
     * If there is an existing catalog item, will use those values.
     */
    private async handleWarehouseQuantity(item: CoreCatalog, existing?: CoreCatalog): Promise<void> {
        if (!this.warehousesPromise) {
            this.warehousesPromise = this.warehousesPromise || new GetWarehousesGearmanApi(this.supplierId.toString()).submit();
        }

        const resp = await this.warehousesPromise;
        const warehouses = resp?.success ? resp.warehouses : undefined;

        if (!warehouses) {
            throw new Error(`Unable to load warehouses for supplier: ${this.supplierId} - ${JSON.stringify(resp)}`);
        }

        const existingWarehouses = new Set<string>();
        const newWarehouses = item.warehouses = item.warehouses || [];

        // First loop through existing warehouses, adding warehouse quantities
        for (const existingWarehouse of existing?.warehouses || []) {
            if (!existingWarehouse) {
                continue;
            }

            existingWarehouses.add(existingWarehouse.warehouse_id);
            newWarehouses.push(existingWarehouse);
            if (!existingWarehouse.quantity) {
                existingWarehouse.quantity = 0;
            }
        }

        // Then add quantities for any remaining warehouses.
        for (const warehouse of warehouses) {
            if (existingWarehouses.has(warehouse.warehouseId)) {
                continue;
            }

            existingWarehouses.add(warehouse.warehouseId);
            newWarehouses.push({
                quantity: 0,
                warehouse_id: warehouse.warehouseId,
                code: warehouse.code
            });
        }
    }

}
