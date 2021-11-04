import { gunzip, gzip } from 'zlib';

export * from './catalog-item-search';
export * from './warehouses-loader';
export * from './api-credentials';

export function assertUnreachable(value: never, valueDescription = 'value', context = ''): never {
    throw new Error(`Unexpected ${valueDescription} found: ${JSON.stringify(value)} - ${context}`);
}

export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

export function gunzipAsync(text: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        gunzip(Buffer.from(text, 'binary'), (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}
