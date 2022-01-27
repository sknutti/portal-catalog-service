import { DscoImage } from '@dsco/bus-models/dist/item';
import { ProductStatus } from '@dsco/ts-models';
import { CoreCatalog, createCoreCatalog } from '@lib/core-catalog';
import { TinyWarehouse } from '@lib/requests';
import { CellValue, DscoCatalogRow, DscoColumn, DscoSpreadsheet } from '@lib/spreadsheet';

/**
 * This is an intermediate representation of a row in a physical spreadsheet (google sheet, xslx sheet)
 *
 * Catalog item data can be extracted from this row by converting it into a DscoCatalogRow
 * @see DscoCatalogRow
 */
export abstract class PhysicalSpreadsheetRow {
    /**
     * Returns an iterator over the values of this spreadsheet.  Note: SKU must be the first cell value returned from this iterator
     */
    protected abstract getCellValues(dscoSpreadsheet: DscoSpreadsheet): IterableIterator<[CellValue, DscoColumn]>;

    /**
     * Parses the SpreadsheetRow, turning it into a DscoCatalogRow.
     *
     * @param dscoSpreadsheet - Used to get column & validation information
     * @param supplierId -
     * @param retailerId -
     * @param categoryPath -
     * @param warehouses - The supplier's warehouses
     * @param existingCatalogItems - Used to merge some fields from existing catalog items (such as the images array)
     */
    parseCatalogRow(
        dscoSpreadsheet: DscoSpreadsheet,
        supplierId: number,
        retailerId: number,
        categoryPath: string,
        warehouses: TinyWarehouse[],
        existingCatalogItems: Record<string, CoreCatalog>,
    ): DscoCatalogRow {
        const { catalog } = createCoreCatalog(supplierId, retailerId, categoryPath);

        const row = new DscoCatalogRow(catalog, false, true);

        let filledFromExisting = false;
        let existingItem: CoreCatalog | undefined;
        for (const [cellValue, column] of this.getCellValues(dscoSpreadsheet)) {
            column.writeCellValueToCatalog(cellValue, row, existingItem, retailerId);

            // Fill any necessary info from the existing catalog item as soon as we have a sku
            if (!filledFromExisting && catalog.sku) {
                filledFromExisting = true;
                existingItem = existingCatalogItems[catalog.sku.toUpperCase()];

                if (!existingItem) {
                    row.modified = true;
                }

                this.fillCatalogFromExisting(dscoSpreadsheet, catalog, supplierId, warehouses, existingItem);
            }
        }

        return row;
    }

    /**
     * Some data isn't in the spreadsheet, but needs to be there when saving.
     * This function copies that data from the existing catalog, or gives default values.
     *
     * Should be called immediately after the sku is read from the row
     */
    private fillCatalogFromExisting(
        dscoSpreadsheet: DscoSpreadsheet,
        catalog: CoreCatalog,
        supplierId: number,
        warehouses: TinyWarehouse[],
        existing?: CoreCatalog,
    ): void {
        // If they change the product status to anything but pending,
        // we must have both quantity_available and warehouses quantity.  This gives defaults of zero to both
        if (
            catalog.product_status !== ProductStatus.PENDING &&
            (!existing || existing.product_status === ProductStatus.PENDING)
        ) {
            catalog.quantity_available = existing?.quantity_available || 0;

            this.handleWarehouseQuantity(catalog, supplierId, warehouses, existing);
        }

        // For every column in the spreadsheet that is an image, we need to be sure to copy that column's images array.
        // Otherwise, we would lose images for other retailers or categories.
        if (existing) {
            for (const imageColumn of dscoSpreadsheet.imageColumns) {
                const arrayNameToCopy = imageColumn.imageNames[0];

                catalog[arrayNameToCopy] = this.copyImageArray(existing[arrayNameToCopy as 'images'] || []);
            }
        }
    }

    /**
     * The catalog images we load from Mongo have tons of metadata on them that the Gearman endpoint cant handle.
     * This strips those images down to the bare minimum
     */
    private copyImageArray(images: Partial<DscoImage>[]): Partial<DscoImage>[] {
        const result: Partial<DscoImage>[] = [];

        for (const image of images) {
            if (image.name && image.source_url) {
                result.push({
                    name: image.name,
                    source_url: image.source_url,
                });
            }
        }

        return result;
    }

    /**
     * Sets the appropriate default warehouse_quantity values for all of the supplier's warehouses.
     *
     * If there is an existing catalog item, will use those values.
     */
    private handleWarehouseQuantity(
        item: CoreCatalog,
        supplierId: number,
        warehouses: TinyWarehouse[],
        existing?: CoreCatalog,
    ): void {
        const existingWarehouses = new Set<string>();
        const newWarehouses = (item.warehouses = item.warehouses || []);

        // First loop through existing warehouses, adding warehouse quantities
        for (const existingWarehouse of existing?.warehouses || []) {
            if (!existingWarehouse) {
                continue;
            }

            existingWarehouses.add(existingWarehouse.dsco_id);
			existingWarehouses.add(existingWarehouse.code);
            newWarehouses.push(existingWarehouse);
            if (!existingWarehouse.quantity) {
                existingWarehouse.quantity = 0;
            }
        }

        // TODO: Should all warehouses to be set to zero, or should they not be in the array at all?
        // Then add quantities for any remaining warehouses.
        for (const warehouse of warehouses) {
            if (existingWarehouses.has(warehouse.warehouseId) || existingWarehouses.has(warehouse.code)) {
                continue;
            }

            existingWarehouses.add(warehouse.warehouseId);
			existingWarehouses.add(warehouse.code);
            newWarehouses.push({
                quantity: 0,
                dsco_id: warehouse.warehouseId,
                code: warehouse.code,
            });
        }
    }
}
