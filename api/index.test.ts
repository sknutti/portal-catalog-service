import { readFile } from 'fs';
import { promiseFiles } from 'node-dir';
import * as index from './index';

test('Every request should be exported from index', async () => {
    const recursiveFiles = await promiseFiles(__dirname);

    for (const file of recursiveFiles) {
        if (file.includes('.request.ts')) {
            const contents = await filePromise(file);

            const matches = contents.match(/class (.*?)(<.*>)? extends DsRequest/);
            if (matches?.[1]) {
                expect(index).toHaveProperty(matches[1]);
            }
        }
    }
});

function filePromise(path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        readFile(path, (err, file) => {
            if (err) {
                reject(err);
            } else {
                resolve(file.toString());
            }
        });
    });
}
