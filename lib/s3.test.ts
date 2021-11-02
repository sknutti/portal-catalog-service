import {
    downloadS3Bucket,
    getCatalogItemS3UploadPath,
    downloadS3Metadata,
    getSignedS3Url,
    parseCatalogItemS3UploadUrl
} from '@lib/s3';
import axios from 'axios';
import * as uuid from 'uuid';

process.env.S3_BUCKET = 'catalog-item-test';

test('Parsing s3 upload url works', () => {
    const [supplierId, retailerId, userId, path] = [1234, 5678, 9101112, 'My 😋 || Custom & Weird || Path'];

    const uploadUrl = getCatalogItemS3UploadPath(supplierId, retailerId, userId, path);
    const parsed = parseCatalogItemS3UploadUrl(`https://aws.s3.test.bla/bla/${uploadUrl}?a=b`);

    expect(parsed).toMatchObject({supplierId, retailerId, userId});
});

test('Signed upload url works', async () => {
    const custom_meta = 'My custom meta with all sorts of emojis! 😋 ✂️ 📋 👌';
    const path = 'test/unit-test-😋 ✂️.txt';

    const url = await getSignedS3Url(path, {custom_meta});

    const id = uuid.v4();
    await axios.put(url, id);

    const [body, meta] = await Promise.all([downloadS3Bucket(path), downloadS3Metadata<{ custom_meta: string }>(path)]);
    expect(body.toString('utf8')).toEqual(id);
    expect(meta.custom_meta).toEqual(custom_meta);
});
