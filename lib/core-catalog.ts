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
    error_type: string;
    error_code: string;
    attribute: string;
}

// Following https://chb.atlassian.net/wiki/spaces/CCAR/pages/98302329486/Data+Contract
export interface CatalogContentCompliance {
    // error_channels: string[];
    // error_categories: string[];
    // error_fields: string[];
    field_errors: string[];
    [key: string]: any;
}

export interface CatalogFieldError {
    channelId: string;
    categoryPath: string;
    fieldName: string;
    complianceType: string;
    errorCode: string;
    errorMessage: string;
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

export function interpretCatalogFieldError(fieldError: string): CatalogFieldError {
    const genericParseError: CatalogFieldError = {
        channelId: 'error',
        categoryPath: 'error',
        fieldName: 'sku', // This message will appear on the sku column, but will represent an error that applies to the entire row
        complianceType: 'error',
        errorCode: 'PARSE_ERROR',
        errorMessage: `Try uploading this item again. We encountered an error that could not be interpreted: "${fieldError}"`,
    };
    // Try splitting on '__'
    if (fieldError.split('__').length !== 5) {
        console.log(`ERROR interpretCatalogFieldError(...) could not interpret the fieldError: "${fieldError}"`);
        return genericParseError;
    }
    const [pathing, fieldName, complianceType, errorCode, errorMessage] = fieldError.split('__');

    // Split out the channelId and categoryPath
    if (pathing.split(':').length !== 2) {
        console.log(`ERROR interpretCatalogFieldError(...) could not interpret the fieldError: "${fieldError}"`);
        return genericParseError;
    }
    const [channelId, categoryPath] = pathing.split(':');

    return {
        channelId,
        categoryPath,
        fieldName,
        complianceType,
        errorCode,
        errorMessage,
    };
}
