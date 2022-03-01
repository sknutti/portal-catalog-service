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

/**
 * Reads a field from either the catalog or extend attributes, resolving the field xpath (E.G. title_i18n/en-US)
 */
export function extractFieldFromCoreCatalog(fieldXPath: string, catalog: Partial<CoreCatalog>, retailerId: number, type: 'core' | 'extended'): any {
	// Handle special-cased core 'cost' field
	if (type === 'core' && fieldXPath === 'cost' && catalog.__pricing_tiers && 'price01' in catalog.__pricing_tiers) {
		return catalog.__pricing_tiers.price01;
	}

	// Try walking the field as xpath to find it on the catalog
	let result: any = type === 'core' ? catalog : catalog?.extended_attributes?.[retailerId];

	// Don't attempt to read a 'length' attribute if extended_attributes is an array
	if (type === 'extended' && Array.isArray(result)) {
		return null;
	}

	for (let field of fieldXPath.split('/')) {
		if (!result) {
			return undefined;
		}

		if (field in result) {
			result = result[field];
			continue;
		}

		field = camelToSnakeCase(field);

		if (field in result) {
			result = result[field];
			continue;
		}

		/// If checking the top-level catalog item for the field, check if it's a known field in one of our other formats
		if (type === 'core' && result === catalog) {
			if (field in DSF_TO_MSF) {
				const newField = DSF_TO_MSF[field];

				if (newField in result) {
					result = result[newField];
					continue;
				}
			}

			if (field in MSF_TO_DSF) {
				const newField = MSF_TO_DSF[field];

				if (newField in result) {
					result = result[newField];
					continue;
				}
			}
		}

		// Couldn't find the field anywhere, return
		return undefined;
	}

	return result;
}

/**
 * Writes the value to either the catalog or extend attributes, resolving the field xpath (E.G. title_i18n/en-US)
 */
export function writeValueToCatalog(fieldPath: string, valueToSave: any, catalog: CoreCatalog, retailerId: number, fieldType: 'core' | 'extended') {
	let current: any = fieldType === 'core' ? catalog : catalog.extended_attributes![retailerId];

	const fields = fieldPath.split('/');
	for (let i = 0; i < fields.length; i++) {
		let field = fields[i];
		const last = i === fields.length - 1;

		if (fieldType === 'core' && current === catalog) {
			field = getDSFField(field);
		}

		if (last) {
			// The core automatically uppercases all skus.  This mimics that behavior, ensuring the sku doesn't get marked as changed incorrectly
			if (fieldType === 'core' && current === catalog && field === 'sku' && typeof valueToSave === 'string') {
				valueToSave = valueToSave.toUpperCase();
			}

			current[field] = valueToSave;
		} else {
			current = current[field] = current[field] ?? {};
		}
	}
}

/**
 * Parses the field and converts it to a DSF field if it's a MSF field.
 */
export function getDSFField(field: string): string {
    field = camelToSnakeCase(field);

    return MSF_TO_DSF[field] || field;
}
