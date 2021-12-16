import { getPortalCatalogS3BucketName } from '@lib/environment';
import {
    copyS3Object,
    downloadS3Bucket,
    downloadS3Metadata,
    createCatalogItemS3UploadPath,
    getSignedS3UploadUrl,
    parseCatalogItemS3UploadUrl,
    writeS3Object,
    getSignedS3DownloadUrl,
} from '@lib/s3';
import axios from 'axios';
import * as uuid from 'uuid';

process.env.S3_BUCKET = 'portal-catalog-test';

test('Parsing s3 upload url works', () => {
    const [supplierId, retailerId, userId, path] = [1234, 5678, 9101112, 'My 😋 || Custom & Weird || Path'];

    const uploadUrl = createCatalogItemS3UploadPath(supplierId, retailerId, userId, path);
    const parsed = parseCatalogItemS3UploadUrl(`https://aws.s3.test.bla/bla/${uploadUrl}?a=b`);

    expect(parsed).toMatchObject({ supplierId, retailerId, userId });
});

test('Signed upload and download url works', async () => {
    const custom_meta = 'My custom meta with all sorts of emojis! 😋 ✂️ 📋 👌';
    const path = 'test/unit-test-😋 ✂️.txt';

    const url = await getSignedS3UploadUrl(path, { custom_meta });

    const id = uuid.v4();
    await axios.put(url, id);

    // Download directly to verify the metadata was stored
    const [body, [meta]] = await Promise.all([
        downloadS3Bucket(path),
        downloadS3Metadata<{ custom_meta: string }>(path),
    ]);
    expect(body.toString('utf8')).toEqual(id);
    expect(meta.custom_meta).toEqual(custom_meta);

    // Also download via signed url
    const downloadUrl = await getSignedS3DownloadUrl(path, 'test 😋 \'it".txt');
    const resp = await axios.get(downloadUrl);
    expect(resp.headers['content-disposition']).toEqual('attachment; filename ="test%20%F0%9F%98%8B%20\'it%22.txt"');
    expect(resp.data).toEqual(id);
});

test('Write & copy s3 object works', async () => {
    const source_path = 'test/unit-test-copy-source-😋 ✂️.txt';
    const dest_meta = 'Destination meta';
    const dest_path = 'test/unit-test-copy-dest-😋 ✂️.txt';

    // First setup a source file
    const id = uuid.v4();
    const s3Bucket = getPortalCatalogS3BucketName();
    await writeS3Object(s3Bucket, source_path, id);

    // Then copy that file
    await copyS3Object(
        { bucket: s3Bucket, path: encodeURIComponent(source_path) },
        {
            bucket: s3Bucket,
            path: dest_path,
        },
        { custom_meta: dest_meta },
    );

    // Download the copied file and verify it's correct
    const [body, [meta]] = await Promise.all([
        downloadS3Bucket(dest_path),
        downloadS3Metadata<{ custom_meta: string }>(dest_path),
    ]);
    expect(body.toString('utf8')).toEqual(id);
    expect(meta.custom_meta).toEqual(dest_meta);
});
