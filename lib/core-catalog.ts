import { Catalog, CatalogImage, ProductStatus, SnakeCase } from '@dsco/ts-models';

// This allows us to access snake_cased values on the catalog.
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
    compliance?: CatalogContentCompliance;
    [key: string]: any;
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
    cattegoryPath: string;
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

export function interpretCatalogFieldError(field_error: string): CatalogFieldError {
    const genericParseError: CatalogFieldError = {
        channelId: 'error',
        cattegoryPath: 'error',
        fieldName: 'error plus extra text to make sure this message does not match a value field',
        complianceType: 'error',
        errorCode: 'PARSE_ERROR',
        errorMessage: 'Error message was poorly formatted and could not be parsed',
    };
    // Try splitting on '__'
    const fieldErrorSplit: string[] = field_error.split('__');
    if (fieldErrorSplit.length !== 5) return genericParseError;

    // Split out the channelId and categoryPath
    const channelAndCategorySplit = fieldErrorSplit[0].split(':');
    if (channelAndCategorySplit.length !== 2) return genericParseError;

    return {
        channelId: channelAndCategorySplit[0],
        cattegoryPath: channelAndCategorySplit[1],
        fieldName: fieldErrorSplit[1],
        complianceType: fieldErrorSplit[2],
        errorCode: fieldErrorSplit[3],
        errorMessage: fieldErrorSplit[4],
    };
}
