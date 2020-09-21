import { ProductStatus } from '@dsco/ts-models';
import { CoreCatalog, createCoreCatalog } from '@lib/core-catalog';
import { CellValue, DscoCatalogRow, DscoColumn, DscoSpreadsheet } from '@lib/spreadsheet';
import { WarehousesLoader } from '@lib/utils';

/**
 * This is an intermediate representation of a row in a physical spreadsheet (google sheet, xslx sheet)
 *
 * Can be parsed into a DscoCatalogRow
 * @see DscoCatalogRow
 */
export abstract class PhysicalSpreadsheetRow {
    protected abstract getCellValues(dscoSpreadsheet: DscoSpreadsheet): IterableIterator<[CellValue, DscoColumn]>;

    /**
     * Will be called after the row is finished parsing. Should return true if the row data indicates it has been modified
     */
    protected abstract getIsModified(): boolean;


    /**
     * Parses the SpreadsheetRow, turning it into a DscoCatalogRow.
     *
     * @param dscoSpreadsheet Used to get column & validation information
     * @param supplierId
     * @param retailerId
     * @param categoryPath
     * @param existingCatalogItems Used to merge some fields from existing catalog items (such as the images array)
     */
    async parseCatalogRow(
      dscoSpreadsheet: DscoSpreadsheet,
      supplierId: number,
      retailerId: number,
      categoryPath: string,
      existingCatalogItems: Record<string, CoreCatalog>
    ): Promise<DscoCatalogRow> {
        const {catalog, extended} = createCoreCatalog(supplierId, retailerId, categoryPath);

        let filledFromExisting = false;
        let hasExistingItem = false;
        let emptyRow = true;
        for (const [cellValue, column] of this.getCellValues(dscoSpreadsheet)) {
            if (column.writeCellValueToCatalog(cellValue, catalog, extended) === 'hasValue') {
                emptyRow = false;
            }

            // Fill any necessary info from the existing catalog item as soon as we have a sku
            if (!filledFromExisting && catalog.sku) {
                filledFromExisting = true;
                const existingItem = existingCatalogItems[catalog.sku.toUpperCase()];
                hasExistingItem = !!existingItem;

                await this.fillCatalogFromExisting(dscoSpreadsheet, catalog, supplierId, existingItem);
            }
        }

        return new DscoCatalogRow(catalog, true, hasExistingItem, emptyRow);
    }

    /**
     * Some data isn't in the spreadsheet, but needs to be there when saving.
     * This function copies that data from the existing catalog, or gives default values.
     *
     * Should be called immediately after the sku is read from the row
     */
    private async fillCatalogFromExisting(dscoSpreadsheet: DscoSpreadsheet, catalog: CoreCatalog, supplierId: number, existing?: CoreCatalog): Promise<void> {
        // If they change the product status to anything but pending,
        // we must have both quantity_available and warehouses quantity.  This gives defaults of zero to both
        if (catalog.product_status !== ProductStatus.PENDING && (!existing || existing.product_status === ProductStatus.PENDING)) {
            catalog.quantity_available = existing?.quantity_available || 0;

            await this.handleWarehouseQuantity(catalog, supplierId, existing);
        }

        // For every column in the spreadsheet that is an image, we need to be sure to copy that column's images array.
        // Otherwise, we would lose images for other retailers or categories.
        if (existing) {
            for (const imageColumn of dscoSpreadsheet.imageColumns) {
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
    private async handleWarehouseQuantity(item: CoreCatalog, supplierId: number, existing?: CoreCatalog): Promise<void> {
        const supplierWarehouses = await WarehousesLoader.loadWarehouses(supplierId);

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

        // TODO: Should all warehouses to be set to zero, or should they not be in the array at all?
        // Then add quantities for any remaining warehouses.
        for (const warehouse of supplierWarehouses) {
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
