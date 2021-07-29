import { camelToSnakeCase } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';

const MSF_TO_DSF: Record<string, string> = {
    item_id: 'dsco_item_id',
    // partner_sku_map: {
    //     sku: 'partner_sku',
    //     retailer_id: 'dsco_retailer_id'
    // },
    product_id: 'dsco_product_id',
    supplier_id: 'dsco_supplier_id',
    categories_map: 'categories',
    wholesale_cost: 'cost',
    long_description: 'description',
    create_date: 'dsco_create_date',
    last_product_status_update: 'dsco_last_product_status_update_date',
    dsco_last_touch_date: 'dsco_last_update_date',
    catalogs: 'assortments',
    last_cost_update: 'dsco_last_cost_update_date',
    product_description: 'long_text_description',
};

const DSF_TO_MSF: Record<string, string> = {
    dsco_item_id: 'item_id',
    dsco_product_id: 'product_id',
    dsco_supplier_id: 'supplier_id',
    categories: 'categories_map',
    cost: 'wholesale_cost',
    description: 'long_description',
    dsco_create_date: 'create_date',
    dsco_last_product_status_update_date: 'last_product_status_update',
    dsco_last_update_date: 'dsco_last_touch_date',
    assortments: 'catalogs',
    dsco_last_cost_update_date: 'last_cost_update',
    long_text_description: 'product_description',
};

export function extractFieldFromCoreCatalog(field: string, catalog: CoreCatalog): any {
    if (field in catalog) {
        return catalog[field];
    }

    field = camelToSnakeCase(field);

    if (field in catalog) {
        return catalog[field];
    }

    if (field === 'cost' && catalog.__pricing_tiers && 'price01' in catalog.__pricing_tiers) {
        return catalog.__pricing_tiers.price01;
    }

    if (field in DSF_TO_MSF) {
        const newField = DSF_TO_MSF[field];

        if (newField in catalog) {
            return catalog[newField];
        }
    }

    if (field in MSF_TO_DSF) {
        const newField = MSF_TO_DSF[field];

        if (newField in catalog) {
            return catalog[newField];
        }
    }

    return catalog[field];
}

/**
 * Parses the field and converts it to a DSF field if it's a MSF field.
 */
export function getDSFField(field: string): string {
    field = camelToSnakeCase(field);

    return MSF_TO_DSF[field] || field;
}
