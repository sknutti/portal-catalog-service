export * from './catalog-item-search';
export * from './warehouses-loader';
export * from './send-websocket-event';

export function assertUnreachable(value: never, valueDescription = 'value', context = ''): never {
    throw new Error(`Unexpected ${valueDescription} found: ${JSON.stringify(value)} - ${context}`);
}

export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}
