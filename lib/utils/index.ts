export * from './catalog-item-search';
export * from './warehouses-loader';

export function assertUnreachable(value: never, valueDescription = 'value', context = ''): never {
    throw new Error(`Unexpected ${valueDescription} found: ${JSON.stringify(value)} - ${context}`);
}
