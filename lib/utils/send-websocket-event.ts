/* eslint-disable @typescript-eslint/no-var-requires */

import { Transform } from 'stream';
import { CatalogSpreadsheetWebsocketEvents } from '@api/index';

const config = require('leo-config');
config.bootstrap(require('../../leo_config'));
const leo = require('leo-sdk');
const ls = require('leo-streams');

export async function sendWebsocketEvent<K extends keyof CatalogSpreadsheetWebsocketEvents>(
    type: K,
    data: CatalogSpreadsheetWebsocketEvents[K],
    accountId: number,
): Promise<void> {
    if (process.env.ENVIRONMENT === 'test' || process.env.LEO_LOCAL) {
        console.log(`Sending websocket message: ${type}`, JSON.stringify(data, null, 2));
    }

    await pushEventToLeo('portalCategoryBotId', {
        type: 'catalogBroadcastNotification',
        accountId,
        event: {
            type,
            ...data,
        },
        timestamp: Date.now(),
    });
}

async function pushEventToLeo(botId: string, payload: any) {
    const through: Transform = ls.through((payload: any, done: (a: null, b: any) => void) => {
        const event = {
            event_source_timestamp: Date.now(),
            id: botId,
            correlation_id: {
                source: botId,
                start: 1,
            },
            payload,
        };
        done(null, event);
    });

    const myPipe = pipe(through, leo.load(botId, 'websocket-notify', {}));

    through.push(payload);
    through.push(null);

    await myPipe;
}

function pipe(...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
        args.push((err: any) => (err ? reject(err) : resolve()));
        ls.pipe(...args);
    });
}
