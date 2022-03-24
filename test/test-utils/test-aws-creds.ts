import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity/';
import { CognitoIdentityCredentials, fromCognitoIdentity } from '@aws-sdk/credential-provider-cognito-identity';
import { getAwsRegion, getDscoEnv } from '@lib/environment';
import { setApiCredentials } from '@lib/utils';
import * as AWS from 'aws-sdk';
import { CognitoIdentity } from 'aws-sdk';

const defaultUserPrefix = 'user_'; // user_ or admin_
const tokenDuration = 15000;

/**
 * Inits the aws credentials, returning the user's identityId
 */
export async function initAWSCredentials(userId: number): Promise<string> {
    AWS.config.region = getAwsRegion();
    AWS.config.credentials = new AWS.SharedIniFileCredentials();

    const creds = await getCredentials(userId);
    setApiCredentials(new AWS.Credentials(creds));

    return creds.identityId;
}

export const getCredentials = async (userId: number): Promise<CognitoIdentityCredentials> => {
    const auth = await getAuth(userId);
    return fromCognitoIdentity({
        client: new CognitoIdentityClient({
            region: getAwsRegion(),
            serviceId: 'execute-api',
            credentials: new AWS.SharedIniFileCredentials(),
        }),
        identityId: auth.IdentityId!,
        logins: {
            'cognito-identity.amazonaws.com': auth.Token!,
        },
    })();
};

export const getAuth = async (
    userId: number,
    userPrefix: 'user_' | 'admin_' = defaultUserPrefix,
): Promise<CognitoIdentity.Types.GetOpenIdTokenForDeveloperIdentityResponse> => {
    const cognitoIdentity = new CognitoIdentity({
        region: getAwsRegion(),
        credentials: {
            accessKeyId: AWS.config.credentials!.accessKeyId,
            secretAccessKey: AWS.config.credentials!.secretAccessKey,
        },
    });

    const identityPoolId = {
        test: 'us-east-1:80b3d91e-563f-4eda-a70b-d85140e2125a',
        staging: 'us-east-1:dc79ebb9-3313-47dd-b31d-2ffe60c7f21c',
        prod: 'us-east-1:4b960ed4-82ac-42d0-ae3e-ec2d1a5a6e1f',
    }[getDscoEnv()];

    return cognitoIdentity
        .getOpenIdTokenForDeveloperIdentity({
            IdentityPoolId: identityPoolId,
            Logins: {
                'login.dsco.io': `${userPrefix}${userId}`,
            },
            TokenDuration: tokenDuration,
        })
        .promise();
};
