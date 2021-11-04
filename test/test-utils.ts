import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity/';
import { CognitoIdentityCredentials, fromCognitoIdentity } from '@aws-sdk/credential-provider-cognito-identity';
import { setApiCredentials } from '@lib/utils';
import * as AWS from 'aws-sdk';
import { CognitoIdentity, SharedIniFileCredentials } from 'aws-sdk';

const credentials = new SharedIniFileCredentials();

const defaultUserPrefix = 'user_'; // user_ or admin_
const identityPoolId = 'us-east-1:80b3d91e-563f-4eda-a70b-d85140e2125a'; // hard coded for test
const tokenDuration = 15000;
const region = 'us-east-1';

export async function initAWSCredentials(userId: string): Promise<void> {
    AWS.config.region = region;
    const creds = new AWS.Credentials(await getCredentials(userId));
    setApiCredentials(creds);
    AWS.config.credentials = new AWS.SharedIniFileCredentials();
}

export const getCredentials = async (userId: string): Promise<CognitoIdentityCredentials> => {
    const auth = await getAuth(userId);
    return fromCognitoIdentity({
        client: new CognitoIdentityClient({
            region,
            serviceId: 'execute-api',
            credentials: new AWS.SharedIniFileCredentials()
        }),
        identityId: auth.IdentityId!,
        logins: {
            'cognito-identity.amazonaws.com': auth.Token!,
        },
    })();
};

export const getAuth = async (
  userId: string,
  userPrefix: 'user_' | 'admin_' = defaultUserPrefix,
): Promise<CognitoIdentity.Types.GetOpenIdTokenForDeveloperIdentityResponse> => {
    const cognitoIdentity = new CognitoIdentity({
        region,
        credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
        },
    });

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
