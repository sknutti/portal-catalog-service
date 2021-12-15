import { CoreCatalog } from '@lib/core-catalog';
import { catalogExceptionsItemSearch } from './catalog-item-search';

test('Exception item search returns empty array when there are no results for an ES query', async () => {
    const testResult = await catalogExceptionsItemSearch(1, 1, 'this will get zero results');
    const expectedResult: CoreCatalog[] = [];
    expect(testResult).toEqual(expectedResult);
});

test('Exception item search throws error when the ES request fails', async () => {
    expect(catalogExceptionsItemSearch(0, 0, 'this will fail')).rejects.toThrow('Bad response');
});
