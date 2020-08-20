import { SecretsManagerHelper } from '@dsco/service-utils';
import { drive_v3, google, script_v1, sheets_v4 } from 'googleapis';
import Drive = drive_v3.Drive;
import Script = script_v1.Script;
import Sheets = sheets_v4.Sheets;
import NP from 'number-precision';

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
    script: Script
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
        script: google.script({version: 'v1', auth: oauthClient}),
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


/**
 * @see https://developers.google.com/sheets/api/reference/rest/v4/DateTimeRenderOption#ENUM_VALUES.SERIAL_NUMBER
 */
export class SerialDate {
    private static START_TIME = Date.UTC(1899, 11, 30);
    private static MS_IN_DAY = 1000 * 60 * 60 * 24;

    static toJSDate(serialDate: number): Date {
        return new Date(SerialDate.START_TIME + (serialDate * SerialDate.MS_IN_DAY));
    }

    static fromJSDate(date: Date): number {
        const time = date.getTime();

        return (time - SerialDate.START_TIME) / SerialDate.MS_IN_DAY;
    }

    /**
     * Converts google's serialDate to a human readable time
     * toTime(0.5 (noon)) = 12:00 PM
     */
    static toTime(time: number): string {
        const date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, (time - Math.floor(time)) * this.MS_IN_DAY));
        let hours = date.getUTCHours();
        const ext = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) {
            hours -= 12;
        }
        if (hours === 0) { // midnight
            hours = 12;
        }

        let mins = `${date.getUTCMinutes()}`;
        if (mins.length === 1) {
            mins = `0${mins}`;
        }

        return `${hours}:${mins} ${ext}`;
    }

    /**
     * Converts a user time string into a google serialDate
     * fromTime('12:00 PM') = 0.5
     */
    static fromTime(time: string): number {
        const ms = new Date(`2020-12-31 ${time}`).getTime() - new Date('2020-12-31 00:00').getTime();
        return ms / SerialDate.MS_IN_DAY;
    }
}
