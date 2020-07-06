import { Catalog, CatalogImage, SnakeCase } from '@dsco/ts-models';

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
    [key: string]: any;
}
