'use strict';
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable  @typescript-eslint/no-unused-vars */
import { APIGatewayProxyEvent } from 'aws-lambda';
// import {
//     scrubberWhitelistOptions,
//     scrubStringForXss,
//     xssScrubberAll,
// } from '@lib/datautil/xss';
import { ChannelOverride, ListingStatus, ItemSkuOverrideLeoEvent, ItemReplacements } from '@dsco/bus-models';
//import { belongsToEnumOrUndefined, hasForeignKeys } from '@lib/datautil/misc_util';
//import * as logz from '@lib/network/api_logger';
import { Writable } from 'stream';
//import { TradingPartner } from '@lib/model/trading_partner';
//import { getAccount } from '@lib/network/account_search';
// import { queues } from '@lib/leo/config';
//import { s3MetaData } from '@lib/model/s3_meta_data.model';
//import { getTradingPartnerStatusFromConnectionStatus } from '../../account/src/lambda/get_trading_partners';

// import { generateNewUUIDv4 } from '@lib/datautil/uuid';
import { RetailModel } from '@dsco/bus-models/dist/retail-model';
//import { serializeError } from 'serialize-error';
import { v4 as uuidv4 } from 'uuid';
import * as AWS from 'aws-sdk';
import * as es from 'elasticsearch';
import { AccountElasticsearch, ConnectionStatus } from '@dsco/ts-models';


const leosdk_source =  {
   
        LeoArchive: 'TestBus-LeoArchive-WUWG7N8OXG97',
        LeoCron: 'TestBus-LeoCron-OJ8ZNCEBL8GM',
        LeoEvent: 'TestBus-LeoEvent-FNSO733D68CR',
        LeoFirehoseStream: 'TestBus-LeoFirehoseStream-1M8BJL0I5HQ34',
        LeoKinesisStream: 'TestBus-LeoKinesisStream-1XY97YYPDLVQS',
        LeoS3: 'testbus-leos3-1erchsf3l53le',
        LeoSettings: 'TestBus-LeoSettings-YHQHOKWR337E',
        LeoStream: 'TestBus-LeoStream-R2VV0EJ6FRI9',
        LeoSystem: 'TestBus-LeoSystem-L9OY6AV8E954',
        Region: 'us-east-1',
    
};

const config = require('leo-config');
config.bootstrap(require('../../leo_config'));
const leo = require('leo-sdk')(expandConfig(leosdk_source));



type SQLTimestamp = string;
export type IsoString = string;

interface LruObject {
    payload: any;
    expiresAt: Date;
}

const cache: {
    [key: string]: LruObject;
} = {};

interface TradingPartner {
    accountId: OauthAccessToken['account_id'];
    activeDate?: IsoString;
    status: TradingPartnerStatus;
    terminatedDate?: IsoString;
    tradingPartnerId?: string;
    tradingPartnerName?: string;
}

interface OauthAccessToken {
    token_id: string;
    access_token: string;
    authentication_id: string;
    user_name: string;
    user_id: number;
    client_id: string;
    refresh_token: string;
    account_id: string;
    account_type: 'RETAILER' | 'SUPPLIER';
    token_type: string;
    create_date: SQLTimestamp;
    last_update: SQLTimestamp;
}

export interface s3MetaData {
    createDate: Date;
    accountId: string;
    accountType: 'RETAILER' | 'SUPPLIER';
    userId: string;
    correlationId: string;
    itemType: string;
    clUuid: string;
    sourceIpAddress: string;
}

enum TradingPartnerStatus {
    onboarding = 'onboarding',
    active = 'active',
    paused = 'paused',
    terminated = 'terminated',
}

const queues = {
    CATALOG_OVERRIDE: 'catalog-item-overrides',
};

export async function overridesSmallBatch(
    channelOverrides: ChannelOverride[],
    sourceIpAddress: string,
    retailerId_s: string,
    awsRequestId: string,
    correlationId: string,
): Promise<void> {
    const botId = 'apiv3_catalog_overrides_small_batch_to_catalog_item_overrides';
    const retailerId = parseInt(retailerId_s);
    validateChannelOverrides(channelOverrides, awsRequestId);
    const tradingPartnerIdDictionary = await getTradingPartnerIdDictionary(retailerId);
    const targetStream = getWritableStream(botId, queues.CATALOG_OVERRIDE);
    console.log('targetStream is ', targetStream);
    const metaData:s3MetaData = {
        correlationId,
        sourceIpAddress,
        accountType: 'RETAILER',
        userId: retailerId_s,
        createDate: new Date(),
        clUuid: awsRequestId,
        accountId:retailerId_s,
        itemType:'foo'

    };
    const retailerContext: RetailerContext = {
        retailerId,
        tradingPartnerIdDictionary,
        metaData: metaData,
    };

    for (const channelOverride of channelOverrides) {
    
        if (await toItemOverridesStream(channelOverride, retailerContext, targetStream)) {
            const error = new Error(`error sending to stream '${queues.CATALOG_OVERRIDE}'`);
            error.name = 'overridesSmallBatch.errorSendingToStream';
            throw error;
        }
    }
    
    targetStream.end(); //flush stream

}


function generateNewUUIDv4(){
    return uuidv4();
}


// catalog_item_overrides utilities
export function validateChannelOverrides(
    overrides: any[],
    clUuid: string
): boolean {
    return overrides
        .map((override) => validateOneChannelOverride(override, clUuid))
        .reduce((lastResult, currentValue) => lastResult && currentValue);
}

export function validateOneChannelOverride(
    override: ChannelOverride,
    clUuid: string
): boolean {
    if (hasForeignKeys(override, ChannelOverride.fields)) {
        // jsonLogz.info(
        //     {
        //         message: 'selector: foreign keys detected',
        //         override: override,
        //         clUuid,
        //     }
        // );
        return false;
    }

    if (hasForeignKeys(override.replacements, ItemReplacements.fields)) {
        // jsonLogz.info(
        //     {
        //         message: 'replacements: foreign keys detected',
        //         overrideReplacements: override.replacements,
        //         clUuid,
        //     }
        // );
        return false;
    }

    let isValid = false;
    const tester: ChannelOverride = { ...override };
    const isSelectorValid =
        !!tester.dscoItemId ||
        ((!!tester.supplierId || !!tester.tradingPartnerId) &&
            (!!tester.ean ||
                !!tester.gtin ||
                !!tester.isbn ||
                !!tester.mpn ||
                !!tester.partnerSku ||
                !!tester.sku ||
                !!tester.upc));

    if (isSelectorValid) {
        // since ItemReplacements is just a TS "interface" - it doesn't cause anything to fail if they stick random stuff in the replacements collection
        // verify that we have at least one replacement ---
		// TODO (CAT-324) Create an exported set of valid replacement types next to the ItemReplacements interface (bus-models)
        isValid = Object.keys(tester.replacements).length >= 1 && Object.keys(tester.replacements).every(k => ['partnerSku', 'listingStatus', 'retailModel'].includes(k));
        isValid = isValid && belongsToEnumOrUndefined(tester.replacements?.listingStatus, ListingStatus);
        isValid = isValid && belongsToEnumOrUndefined(tester.replacements?.retailModel, RetailModel);
    }

    if (tester.replacements.partnerSku) {
        isValid = isValid && (typeof tester.replacements?.partnerSku === 'string');
    }

    if (!isValid) {
        // jsonLogz.info(
        //     {
        //         message: 'invalid channelOverride',
        //         override: tester,
        //         clUuid,
        //     }
        // );
    }
    return isValid;
}

interface ValidateResults {
    validated: boolean;
    message?: string;
    overrides: ChannelOverride[];
    extras?: any[];
}

export function validateEvent(
    event: APIGatewayProxyEvent,
    clUuid: string,
    maxRequests = 10
): ValidateResults {
    const validationResults: ValidateResults = {
        validated: false,
        extras: [],
        overrides: [],
    };
    if (!event.body) {
        validationResults.message = 'Missing input body';
        return validationResults;
    }
    let bodyElements: any[];
    try {
        bodyElements = JSON.parse(event.body);
    } catch (parsingException) {
        validationResults.message = 'Invalid json';
        validationResults.extras?.push(parsingException);
        return validationResults;
    }

    if (!bodyElements || bodyElements.length === 0) {
        validationResults.message = 'Missing array of item overrides';
        return validationResults;
    }

    const totalOverrides = bodyElements.length;
    if (totalOverrides > maxRequests) {
        validationResults.message = `Total item overrides exceeds maximum ${maxRequests}: ${totalOverrides}.  Use EnrichCatalogLargeBatch instead.`;
        return validationResults;
    }

    if (!validateChannelOverrides(bodyElements, clUuid)) {
        validationResults.message = 'Invalid array of item overrides';
        return validationResults;
    }

    validationResults.overrides.push(...bodyElements);
    validationResults.validated = true;
    return validationResults;
}

export function addSupplierId(tradingPartnerIdDictionary: Map<string, string>, retailerId: number, override: ChannelOverride): ChannelOverride {
    if (!override.tradingPartnerId) {
        // jsonLogz.info({
        //     message: 'addSupplierId called without override.tradingPartnerId', 
        //     retailerId: retailerId, 
        //     channelOverride: override
        // });
        const error = new Error('Missing required override.tradingPartnerId');
        error.name = 'addSupplierId.tradingPartnerId.missing';
		Object.assign(error, {override});
        throw error;
    }
	const tradingPartnerId = override.tradingPartnerId;
    const newOverride = JSON.parse(JSON.stringify(override)) as ChannelOverride;
	// jsonLogz.info({
	// 	message: 'searching for',
	// 	tradingPartnerId: tradingPartnerId,
	// 	tradingPartnerIdDictionary: tradingPartnerIdDictionary}
	// );
    const supplierId = tradingPartnerIdDictionary.get(tradingPartnerId);
    if (!supplierId) {
		// jsonLogz.error({
        //     message: 'SupplierId not found', 
        //     retailerId: retailerId, 
        //     tradingPartnerId: tradingPartnerId
        // });
        const error = new Error(`SupplierId not found for [${retailerId}, ${tradingPartnerId}]`);
        error.name = 'addSupplierId.tradingPartnerId.notFound';
		Object.assign(error, {override});
        throw error;
    }
    newOverride.supplierId = supplierId;
	// jsonLogz.info({
    //     message: 'updated ChannelOverride', 
    //     newOverride: newOverride
    // });
    return newOverride;
}

export interface RetailerContext {
    retailerId: number
    tradingPartnerIdDictionary: Map<string, string>,
    metaData: s3MetaData
}

/**
 * Create an ItemSkuOverrideLeoEvent object to write to leo
 */
export function createItemOverride(
    override: ChannelOverride,
    retailerContext: RetailerContext
): ItemSkuOverrideLeoEvent {
    if (!(override.dscoItemId || override.supplierId)) {
        override = addSupplierId(retailerContext.tradingPartnerIdDictionary, retailerContext.retailerId, override);
    }

    const itemOverrideCorrelationId = generateNewUUIDv4();
    const itemOverride = {
        createDate: retailerContext.metaData.createDate || new Date(),
        accountId: retailerContext.retailerId.toString(),
        accountType: retailerContext.metaData.accountType,
        userId: retailerContext.metaData.userId,
        channelOverride: override,
        correlationId: String(itemOverrideCorrelationId),
        sourceIpAddress: retailerContext.metaData.sourceIpAddress,
        clUuid: retailerContext.metaData.clUuid
    }; //as ItemSkuOverrideLeoEvent;
    return itemOverride;
}

// function errorHandler(error:any) {
//     // logz.error(
//     //     JSON.stringify({
//     //         message: 'error writing change log',
//     //         error: serializeError(error),
//     //     }),
//     // );
//     if(error === undefined){
//         console.log('error handler is undefined')
//     }
//     console.log('error handler',error);
// }

async function write(stream:any, payload:any): Promise<void> {
    // logz.debug(
    //     JSON.stringify({
    //         message: 'starting a write'
    //     })
    // );
    console.log('starting to write');
    if (!stream.write(payload, (e:any)=> e=== undefined? console.log('no callback error') : console.log('cb', e))) {
        // logz.debug(
        //     JSON.stringify({
        //         message: 'write needs drain'
        //     })
        // );
        console.log('stream needs to drain');
        return new Promise((resolve) => {
            stream.once('drain', () => {
                resolve();
            });
        });
    } else {
        // logz.debug(JSON.stringify({
        //     message: 'write GTG'
        // }));
        console.log('write to GTG');
        return new Promise((resolve) => {
            resolve();
        });
    }
}

export async function toItemOverridesStream(
    channelOverride: ChannelOverride,
    retailerContext: RetailerContext,
    targetStream: Writable
): Promise<boolean> {
    let thereWasAnError = true;
    try {
        const itemOverride = createItemOverride(channelOverride, retailerContext);
        console.log('itemOverride is ', itemOverride);
        await write(targetStream, itemOverride);
        thereWasAnError = false;
    } catch (e) {
        // jsonLogz.error({
        //         message: 'error processing item override',
        //         retailerId: retailerContext.retailerId,
        //         sourceIpAddress: retailerContext.metaData.sourceIpAddress,
        //         correlationId: retailerContext.metaData.correlationId,
        //         clUuid: retailerContext.metaData.clUuid,
        //         error: e,
        //         override: channelOverride,
        //         stream: queues.CATALOG_OVERRIDE
        //     }
        // );
        console.log('error in toItemOverridesStream', e);
    }
    return thereWasAnError;
}

const excludedStatus: Set<ConnectionStatus> = new Set([
    'terminated'
]);

function isSupplierActive(
	connection: { // because AccountElasticSearch.connection doesn't have a type
		account_id?: number;
		account_id_string?: string;
		active_date?: string;
		commission_percentage?: number;
		comm_pct_cost_field_name?: string;
		hold: any;
		initiator_id?: number;
		status: any;
		stopped?: boolean;
		terminate_date?: string;
		trading_partner_id?: string;
		trading_partner_name?: string;
		trading_partner_parent_id?: string; }
	): boolean {
    return !excludedStatus.has(connection.status);
}

async function getAllActiveTradingPartners(retailerId: number): Promise<TradingPartner[]> {
    const account = await getAccount(retailerId);
	const tradingPartnerList = (account.connections || [])
		.filter((connection:any) => {
			return isSupplierActive(connection);
		})
		.map((connection:any) => {
			return {
				accountId: connection.account_id_string,
				status: getTradingPartnerStatusFromConnectionStatus(connection.status), // because it is required
				tradingPartnerId: connection.trading_partner_id
			} as TradingPartner;
		});
	return tradingPartnerList;
}

export async function getTradingPartnerIdDictionary(retailerId: number): Promise<Map<string, string>> {
    const tradingPartners = await getAllActiveTradingPartners(retailerId);
    // jsonLogz.info(`Got trading partners ${JSON.stringify(tradingPartners)}`);
    console.log(`Got trading partners ${JSON.stringify(tradingPartners)}`);
    const tradingPartnerIdDictionary = new Map();
    tradingPartners.forEach((tradingPartner: any) => {
        if (tradingPartner?.tradingPartnerId) { //changed to optional chaining
            tradingPartnerIdDictionary.set(tradingPartner.tradingPartnerId, tradingPartner.accountId);
        } else {
			// jsonLogz.warn({message: 'tradingPartner without tradingPartnerId', tradingPartner: tradingPartner});
            console.log('warning on getTrading PartnerId Dictionary');
		}
    });
    return tradingPartnerIdDictionary;
}

// because calls to logz weren't/aren't sending anything to CloudWatch/console
// export const jsonLogz = {
//     begin: async (event, source, context) => {
//         await logz.begin(event, source, context);
//     },
//     end: async () => {
//         await logz.end();
//     },
//     debug: (message) => {
//         const logString = JSON.stringify(message, mapReplacer);
//         logz.debug(logString);
//     },
// 	info: (message) => {
//         const logString = JSON.stringify(message, mapReplacer);
// 		logz.info(logString);
// 	},
// 	warn: (message) => {
//         const logString = JSON.stringify(message, mapReplacer);
// 		logz.warn(logString);
// 	},
//     error: (message) => {
//         const logString = JSON.stringify(message, mapReplacer);
//         logz.error(logString);
//     }
// };

export function mapReplacer(key:any, value:any):{dataType:string,value:any} | any {
	if(value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()),
        };
	} else {
        return value;
	}
  }

  function getTradingPartnerStatusFromConnectionStatus(cStatus: ConnectionStatus): TradingPartnerStatus {
    switch (cStatus) {
        case 'terminated':
            return TradingPartnerStatus.terminated;
        case 'on-hold':
            return TradingPartnerStatus.onboarding;
        case 'stopped':
            return TradingPartnerStatus.paused;
        default:
            return TradingPartnerStatus.active;
    }
}


async function getAccount(accountId: number): Promise<AccountElasticsearch> {
    const result = await getAccounts([accountId]);
    return result[accountId];
}

async function getAccounts(accountIds: number[]): Promise<{ [accountId: number]: AccountElasticsearch }> {
    if (accountIds.length === 0) {
        return {};
    }

    
      const client = getElasticsearchClient(config.elasticsearch.AccountDomainEndpoint, config.region);
    //CLIENT IS GOOD GOING TO TEST
    const response: Record<number, AccountElasticsearch> = {};

    // loop each accountId and see which (if any) of them are cached
    const nonCachedIds: (string | number)[] = [];
    for (const accountId of accountIds) {
        //check the cache
        const data: AccountElasticsearch = cacheGet(`accountId_${accountId}`);
        if (data) {
            // logz.debug(`v3cache hit for: accountId_${accountId}`);
            response[accountId] = data;
        } else {
            // logz.debug(`v3cache miss for: accountId_${accountId}`);
            nonCachedIds.push(accountId);
        }
    }

    if (nonCachedIds.length === 0) {
        // logz.info(`>>> response (cache): ${JSON.stringify(response)}`);
        return response;
    }

    try {
        let data;
        let lastEsError;
        let retries = 3;
        while (!data && retries > 0) {
            try {
                data = await client.search<AccountElasticsearch>({
                    index: 'account',
                    body: {
                        query: {
                            bool: {
                                filter: [
                                    {
                                        terms: {
                                            account_id: nonCachedIds,
                                        },
                                    },
                                ],
                            },
                        },
                    },
                });
            } catch (ex) {
                lastEsError = ex;
                console.warn(`ES:getAccount warning : ${ex}`);
                retries--;
            }
        }

        if (!data) {
            if (lastEsError) throw lastEsError;
            else throw new Error(`Unable to find account data for ${nonCachedIds}`);
        }

        data.hits.hits.forEach((r: { _source: AccountElasticsearch }) => {
            response[r._source.account_id] = r._source;

            //add to the cache
            // logz.debug(`v3cache store for: accountId_${r._source.account_id}`);
            cacheSet(`accountId_${r._source.account_id}`, r._source);
            // console.log(`accounts::getDataForAll ${r._source.account_id}: ${JSON.stringify(r._source,null,2)}`);
        });

        // logz.info(`>>> response (new): ${JSON.stringify(response)}`);
        return response;
        // eslint-disable-next-line no-empty
    } finally {
    }
}

function getElasticsearchClient(host: string, region: string, options = {}): es.Client {
    // console.log(`host: '${host}, region: '${region}`);
    const elasticsearchConfig = Object.assign(
        {
            awsConfig: new AWS.Config({
                region: region,
            }),
            connectionClass: require('http-aws-es'),
            host: {
                protocol: 'https',
                host: host,
                port: '443',
                path: '/',
            },
            // timeout: '1000000m',
            requestTimeout: 3000,
        },
        options,
    );

    return new es.Client(elasticsearchConfig);
}

function belongsToEnumOrUndefined<T extends { [key: number]: string | number }>(v: any, e: T): boolean {
    return v === undefined || v in e;
}

function hasForeignKeys(obj: Record<string, unknown>, validKeys: Set<string>): boolean {
    for (const k in obj) {
        if (!validKeys.has(k)) {
            return true;
        }
    }

    return false;
}

function cacheGet(key: string): any | undefined {
    const obj = cache[key];
    if (obj && obj.expiresAt >= new Date()) {
        // logz.debug(`v3 cache hit for: ${key}`);
        return obj.payload;
    } else {
        return undefined;
    }

    // console.log(`retrieving ${key} from the cache: ${cache[key]}`);
    // return cache[key] ? cache[key].payload : undefined;

    // return undefined;
}

function expandConfig (sdk:any){
    return {
        region: sdk.Region,
        resources: sdk,
        firehose: sdk.LeoFirehoseStream,
        kinesis: sdk.LeoKinesisStream,
        s3: sdk.LeoS3
    };
}

function cacheSet(key: string, payload: any) {
    // console.log(`XXX adding ${key} to the cache`);
    cache[key] = {
        payload: payload,
        expiresAt: getExpiresAt(),
    };
}

function getExpiresAt(): Date {
    return new Date(new Date().getTime() + 1000 * 60 * 5);
}
export function getWritableStream(botId: string, destination: string, writeConfig = {}): Writable {
   console.log('leo',leo);
    return leo.load(botId, destination);
}