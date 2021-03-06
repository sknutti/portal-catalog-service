/* eslint @typescript-eslint/no-explicit-any: 0 */
import { DscoImage, ComplianceMap } from '@dsco/bus-models/dist/item';
import { Catalog, ProductStatus, SnakeCase } from '@dsco/ts-models';

// This allows us to access snake_cased values on the catalog.
export interface CoreCatalog extends SnakeCase<Catalog> {
    supplier_id: number;
    categories: {
        [partnerId: number]: string[];
    };
    extended_attributes: {
        [key: string]: any;
    };
    images?: Partial<DscoImage>[];
    brand_logo_images?: Partial<DscoImage>[];
    product_images?: Partial<DscoImage>[];
    swatch_images?: Partial<DscoImage>[];
    toSnakeCase: undefined;
    last_update_date?: string;
    sku?: string;
    product_status?: ProductStatus;
    quantity_available?: number;
    warehouses?: Array<{
        dsco_id: string;
        code: string;
        quantity: number;
    }>;
    compliance_map?: ComplianceMap;
    compliance_image_map?: ComplianceMap;
    [key: string]: any;
}

export function createCoreCatalog(
    supplierId: number,
    retailerId: number,
    categoryPath: string,
): {
    catalog: CoreCatalog;
    extended: Record<string, any>;
} {
    const extended: Record<string, any> = {};
    const catalog: CoreCatalog = {
        // This is a kludge to notify validation that errors should come back even when the product_status is pending
        _error_for_pending_: true,
        supplier_id: supplierId,
        categories: {
            [retailerId]: [categoryPath],
        },
        extended_attributes: {
            [retailerId]: extended,
        },
        toSnakeCase: undefined,
    };

    return { catalog, extended };
}
