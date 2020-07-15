import { Catalog, CatalogImage, ProductStatus, SnakeCase } from '@dsco/ts-models';

// This allows us to access snake_cased values on the catalog.
export interface CoreCatalog extends SnakeCase<Catalog> {
    supplier_id: number;
    categories: {
        [partnerId: number]: string[];
    },
    extended_attributes: {
        [partnerId: number]: Record<string, any>;
    },
    images?: CatalogImage[],
    toSnakeCase: undefined,
    last_update_date?: string;
    sku?: string;
    product_status?: ProductStatus;
    quantity_available?: number;
    [key: string]: any;
}

export function createCoreCatalog(supplierId: number, retailerId: number, categoryPath: string): {
    catalog: CoreCatalog,
    extended: Record<string, any>
} {
    const extended: Record<string, any> = {};
    const catalog: CoreCatalog =  {
        supplier_id: supplierId,
        categories: {
            [retailerId]: [categoryPath]
        },
        extended_attributes: {
            [retailerId]: extended
        },
        toSnakeCase: undefined
    };

    return {catalog, extended};
}
