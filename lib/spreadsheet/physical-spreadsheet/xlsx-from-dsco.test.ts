import { CoreCatalog } from '@lib/core-catalog';
import { getValidationErrorsForAColumnFromCatalogData } from './xlsx-from-dsco';

test('Validation error search can extract validation errors from a DscoCatalog object', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: 1234,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
        compliance: {
            error_channels: ['1234'],
            error_categories: ['1234_dsco'],
            error_fields: ['1234_longdescription'],
            field_errors: ['1234:test catalog__longdescription__length__LENGTH_ERROR__this is a test error'],
        },
    };
    const expectedResult = ['this is a test error'];
    const testResult = getValidationErrorsForAColumnFromCatalogData('longdescription', testCatalogData);
    expect(testResult).toEqual(expectedResult);
});

test('Validation error search returns empty array when no errors compliance data is not present', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: 1234,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
    };
    const expectedResult: string[] = [];
    const testResult = getValidationErrorsForAColumnFromCatalogData('longdescription', testCatalogData);
    expect(testResult).toEqual(expectedResult);
});

test('Validation error search returns empty array when field_errors is empty', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: 1234,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
        compliance: {
            field_errors: [],
        },
    };
    const expectedResult: string[] = [];
    const testResult = getValidationErrorsForAColumnFromCatalogData('longdescription', testCatalogData);
    expect(testResult).toEqual(expectedResult);
});

test('Validation error search returns empty array when there are no matches with the given column name', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: 1234,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
        compliance: {
            error_channels: ['1234'],
            error_categories: ['1234_dsco'],
            error_fields: ['1234_longdescription'],
            field_errors: [
                '1234:test catalog__longdescription__length__LENGTH_ERROR__this is a test error',
                '11223334455:ROOT-CAT||CAT1__FIELD1__IMAGE_COMPLIANCE__SIZE__Image could not be resized',
                '11223334455:ROOT-CAT||CAT2__FIELD1__EXTENDED_ATTRIBUTE__LENGTH__should NOT be shorter than 2 characters',
            ],
        },
    };
    const expectedResult: string[] = [];
    const testResult = getValidationErrorsForAColumnFromCatalogData('this wont match anything', testCatalogData);
    expect(testResult).toEqual(expectedResult);
});
