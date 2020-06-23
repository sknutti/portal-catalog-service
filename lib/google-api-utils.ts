import { SecretsManagerHelper } from '@dsco/service-utils';
import { drive_v3, google, sheets_v4 } from 'googleapis';
import Drive = drive_v3.Drive;
import Sheets = sheets_v4.Sheets;

interface GoogleSecret {
    accessToken: string;
    refreshToken: string;
    scopes: string;
    clientSecret: string;
    clientId: string;
}

const secretHelper = new SecretsManagerHelper<GoogleSecret>('catalog-editor-google-api', 60_000);

export async function prepareGoogleApis(): Promise<{
    drive: Drive,
    sheets: Sheets,
    cleanupGoogleApis: () => Promise<void>
}> {
    const {accessToken, refreshToken, clientId, clientSecret} = await secretHelper.getValue();

    const oauthClient = new google.auth.OAuth2(clientId, clientSecret);
    oauthClient.setCredentials({access_token: accessToken, refresh_token: refreshToken});

    let updateAccessTokenPromise: Promise<GoogleSecret> | undefined;
    oauthClient.on('tokens', tokens => {
        if (tokens.access_token && tokens.access_token !== accessToken) {
            console.log('Generated new access token');
            updateAccessTokenPromise = secretHelper.setValue({
                accessToken: tokens.access_token
            });
        }
    });

    return {
        sheets: google.sheets({version: 'v4', auth: oauthClient}),
        drive: google.drive({version: 'v3', auth: oauthClient}),
        cleanupGoogleApis: async () => {
            if (updateAccessTokenPromise) {
                console.log('Saving generated access token');
                await updateAccessTokenPromise;
            }
        }
    };
}

export function getColumnName(idx: number): string {
    const start = 'A'.charCodeAt(0);
    const numLetters = 26;

    let result = '';
    while (idx >= 0)
    {
        const remainder = idx % numLetters;
        result = String.fromCharCode(remainder + start) + result;
        idx = (idx - remainder - 1) / numLetters;
    }
    return result;
}

export function toGoogleSheetsDate(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

export function prepareValueForSpreadsheet(value: string): string {
    return value.replace(/^([+=])/, '\'$1');
}

export function parseValueFromSpreadsheet(value: string): string {
    return value.replace(/^'([+=])/, '$1');
}
