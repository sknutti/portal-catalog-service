import { getPortalCatalogS3BucketName } from '@lib/environment';
import {
    copyS3Object,
    downloadS3Bucket,
    downloadS3Metadata,
    createCatalogItemS3UploadPath,
    getSignedS3Url,
    parseCatalogItemS3UploadUrl,
    writeS3Object,
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

test('Signed upload url works', async () => {
    const custom_meta = 'My custom meta with all sorts of emojis! 😋 ✂️ 📋 👌';
    const path = 'test/unit-test-😋 ✂️.txt';

    const url = await getSignedS3Url(path, { custom_meta });

    const id = uuid.v4();
    await axios.put(url, id);

    const [body, meta] = await Promise.all([downloadS3Bucket(path), downloadS3Metadata<{ custom_meta: string }>(path)]);
    expect(body.toString('utf8')).toEqual(id);
    expect(meta.custom_meta).toEqual(custom_meta);
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
    const [body, meta] = await Promise.all([
        downloadS3Bucket(dest_path),
        downloadS3Metadata<{ custom_meta: string }>(dest_path),
    ]);
    expect(body.toString('utf8')).toEqual(id);
    expect(meta.custom_meta).toEqual(dest_meta);
});
