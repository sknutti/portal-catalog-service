import { CatalogFieldError, interpretCatalogFieldError } from './core-catalog';

test('Interpret good catalog field error', () => {
    const testInput = 'a:b__c__d__e__f';
    const expectedResponse: CatalogFieldError = {
        channelId: 'a',
        categoryPath: 'b',
        fieldName: 'c',
        complianceType: 'd',
        errorCode: 'e',
        errorMessage: 'f',
    };
    const testResponse: CatalogFieldError = interpretCatalogFieldError(testInput);
    expect(testResponse).toEqual(expectedResponse);
});

test('Interpreter fails on poorly formatted catalog field error (missing field)', () => {
    const testInput = 'a:b__c__e__f';
    const expectedResponse: CatalogFieldError = {
        channelId: 'error',
        categoryPath: 'error',
        fieldName: 'sku',
        complianceType: 'error',
        errorCode: 'PARSE_ERROR',
        errorMessage: 'We encountered an error that could not be interpreted: "a:b__c__e__f"',
    };
    const testResponse: CatalogFieldError = interpretCatalogFieldError(testInput);
    expect(testResponse).toEqual(expectedResponse);
});

test('Interpreter fails on poorly formatted catalog field error (bad channelId + categoryPath)', () => {
    const testInput = 'ab__c__d__e__f';
    const expectedResponse: CatalogFieldError = {
        channelId: 'error',
        categoryPath: 'error',
        fieldName: 'sku',
        complianceType: 'error',
        errorCode: 'PARSE_ERROR',
        errorMessage: 'We encountered an error that could not be interpreted: "ab__c__d__e__f"',
    };
    const testResponse: CatalogFieldError = interpretCatalogFieldError(testInput);
    expect(testResponse).toEqual(expectedResponse);
});
