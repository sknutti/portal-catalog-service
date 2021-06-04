import { gzip } from 'zlib';

export * from './catalog-item-search';
export * from './warehouses-loader';

export function assertUnreachable(value: never, valueDescription = 'value', context = ''): never {
    throw new Error(`Unexpected ${valueDescription} found: ${JSON.stringify(value)} - ${context}`);
}

export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function gzipAsync(buffer: Buffer): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        gzip(buffer, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result.toString('binary'));
            }
        });
    });
}
