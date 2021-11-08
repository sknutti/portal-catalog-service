import { getAssortments } from '@api/get-assortments/get-assortments';
import { GetAssortmentsResponse } from '@api/index';
import { createContext } from '@dsco/service-utils';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { initAWSCredentials } from '../test-utils';

// Aidan Test Supplier
const userId = 26366;
const identityId = 'us-east-1:575be63f-b373-49c6-8113-b3558b418200';

// Note: this test requires the dsco vpn because of gearman
test('get assortments works', async () => {
    await initAWSCredentials(userId);

    const apiGwResp = await getAssortments(
        {
            body: '',
            requestContext: {
                identity: {
                    cognitoIdentityId: identityId,
                },
            },
        } as APIGatewayProxyEvent,
        createContext(),
    );

    const resp: GetAssortmentsResponse = JSON.parse(apiGwResp.body);

    expect(resp).toBeTruthy();
    expect(resp.assortments).toBeTruthy();
    expect(Array.isArray(resp.assortments)).toBeTruthy();
});
