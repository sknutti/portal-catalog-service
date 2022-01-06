/* eslint-disable @typescript-eslint/no-empty-interface */
import { DscoImage } from '@dsco/bus-models';
import { Catalog, ProductStatus, SnakeCase } from '@dsco/ts-models';
import * as dbm from '@dsco/bus-models';

// This allows us to access snake_cased values on the catalog.
// TODO We should be able to get this interface from "@dsco/bus-models": "^0.1.63" rather than declaring it here
// Addressed by: https://chb.atlassian.net/browse/CCR-135
export interface CoreCatalog extends SnakeCase<Catalog> {
    supplier_id: number;
    categories: {
        [partnerId: number]: string[];
    };
    extended_attributes: {
        [partnerId: number]: Record<string, any>;
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
        warehouse_id: string;
        code: string;
        quantity: number;
    }>;
    compliance_map?: dbm.ComplianceMap;
    compliance_image_map?: dbm.ComplianceMap;
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
