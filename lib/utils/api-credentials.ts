import { Credentials } from 'aws-sdk';
import * as AWS from 'aws-sdk';

let api_credentials: Credentials | undefined;

/**
 * This allows tests to override which credentials are used when calling external apis
 */
export function setApiCredentials(credentials: Credentials): void {
    api_credentials = credentials;
}

export function getApiCredentials(): Credentials {
    return api_credentials ?? (AWS.config.credentials as Credentials);
}
