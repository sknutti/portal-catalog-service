import { sendFanaticsEmail, getFanaticsAccountForEnv, getRetailerIdFromPath } from '@lib/fanatics';
import * as env from './environment';


beforeEach(() => {    
    jest.spyOn(env, 'getDscoEnv').mockImplementation(() => 'prod');
});
  
afterEach(() => {    
    jest.clearAllMocks();
});
  
test('Can send email via ses', async () => {
    process.env.SEND_EMAIL_TEST = 'true';
    process.env.ENVIRONMENT = 'test';

    await sendFanaticsEmail(
        { supplierId: 1312312, s3Path: 'staging/my-upload.csv', uploadTime: new Date() },
        {
            rowWithError: 32,
            genericMessage: 'Something went wrong!',
            validationErrors: ['UPC Must be 6 or 12 digits', 'When color is provided, color_code is required'],
            callId: 'abc123',
        },
    );
});

test('getFanaticsAccountForEnv', () => {
    const rId = 1000013240;
    const account = getFanaticsAccountForEnv(rId);

    expect(account).toMatchObject({
        categoryPath: 'Fan Shop cat1760001hqs',
        retailerId: 1000013240,
        supplierId: 1000043924,
        userId: 31615,
    });
});

test('getRetailerIdFromPath worsk for AAFES', () => {
    const pathRetailerId = 1000013240;
    const path = `prod/${pathRetailerId}/test-fanatics-aafes.csv`;

    const retailerId = getRetailerIdFromPath(path);

    expect(retailerId).toEqual(pathRetailerId);
});

test('getRetailerIdFromPath worsk for Default Nordstrom', () => {
    const path = 'prod/test-fanatics-nordstrom.csv';
    const def = 0;

    const retailerId = getRetailerIdFromPath(path);

    expect(retailerId).toEqual(def);
});
