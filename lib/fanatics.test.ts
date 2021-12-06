import { sendFanaticsEmail } from '@lib/fanatics';

test('Can send email via ses', async () => {
    process.env.SEND_EMAIL_TEST = 'true';
    process.env.ENVIRONMENT = 'test';

    await sendFanaticsEmail({supplierId: 1312312, s3Path: 'staging/my-upload.csv', uploadTime: new Date()}, {
        rowWithError: 32,
        genericMessage: 'Something went wrong!',
        validationErrors: ['UPC Must be 6 or 12 digits', 'When color is provided, color_code is required']
    });
});
