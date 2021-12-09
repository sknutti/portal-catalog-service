import { CatalogFieldError, interpretCatalogFieldError } from './core-catalog';

test('Interpret good catalog field error', () => {
    const testInput = 'a:b__c__d__e__f';
    const expectedResponse: CatalogFieldError = {
        channelId: 'a',
        cattegoryPath: 'b',
        fieldName: 'c',
        complianceType: 'd',
        errorCode: 'e',
        errorMessage: 'f',
    };
    const testResponse: CatalogFieldError = interpretCatalogFieldError(testInput);
    expect(testResponse).toEqual(expectedResponse);
});
