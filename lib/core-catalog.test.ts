import { CatalogFieldError, interpretCatalogFieldError } from './core-catalog';

test('Interpret good catalog field error', () => {
    const testInput = 'a_b_c';
    const expectedResponse: CatalogFieldError = {
        channel_id: 'a',
        field_name: 'b',
        errorcode: 'c',
    };
    const testResponse: CatalogFieldError = interpretCatalogFieldError(testInput);
    expect(testResponse).toEqual(expectedResponse);
});
