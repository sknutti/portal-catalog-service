import { Catalog, CatalogImage, ProductStatus, SnakeCase } from '@dsco/ts-models';

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
    images?: CatalogImage[];
    brand_logo_images?: CatalogImage[];
    product_images?: CatalogImage[];
    swatch_images?: CatalogImage[];
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
    compliance_map?: CatalogContentComplianceMap;
    [key: string]: any;
}

// Following https://chb.atlassian.net/wiki/spaces/CCAR/pages/98302329486/Data+Contract
export interface CatalogContentComplianceMap {
    [retailerId: number]: CatalogContentComplianceCategoriesMap;
}

export interface CatalogContentComplianceCategoriesMap {
    categories_map: CatalogComplianceContentCategories;
}

export interface CatalogComplianceContentCategories {
    [categoryPath: string]: CatalogContentCategoryCompliance;
}

export interface CatalogContentCategoryCompliance {
    compliance_state: string;
    compliance_date: string;
    compliance_errors: CatalogContentComplianceError[];
}

export interface CatalogContentComplianceError {
    error_message: string;
    error_state: string;
    error_details?: string;
    error_type: ComplianceType;
    error_code: string;
    attribute: string;
}

export enum ComplianceType {
    CATEGORY = 'CATEGORY',
    EXTENDED_ATTRIBUTE = 'EXTENDED_ATTRIBUTE',
    IMAGE_COMPLIANCE = 'IMAGE_COMPLIANCE',
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
