'use strict';
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable  @typescript-eslint/no-unused-vars */
import {ChannelOverride, ItemReplacements, ListingStatus} from '@dsco/bus-models/dist/item';
import {RetailModel} from '@dsco/bus-models/dist/retail-model';
import {ItemSkuOverrideLeoEvent} from '@dsco/bus-models';
import {AccountElasticsearch, ConnectionStatus} from '@dsco/ts-models';
import * as es from 'elasticsearch';
import {Writable} from 'stream';
import * as AWS from 'aws-sdk';
import * as uuid from 'uuid';

const config = require('leo-config');
config.bootstrap(require('../../leo_config'));
const leo = require('leo-sdk');

let client:es.Client;
let cache: {
    [key: string]: LruObject
} = {};

export type ChangeLogType = 'ItemV3' | 'CatalogV3' | 'ItemOverrideV3' | 'OrderV3' /*| 'WebhookV3'*/ | 'InvoiceV3' | 'ReturnV3';
const queues = {
    CATALOG_OVERRIDE: 'catalog-item-overrides'
};

export interface ChangeLogContext {
    db: AWS.DynamoDB;
    clUuid: string;
    accountId: string;
    clType: ChangeLogType;
}

export interface RetailerContext {
    retailerId: number
    tradingPartnerIdDictionary: Map<string, string>,
    metaData: s3MetaData
}

export interface s3MetaData {
	createDate: Date,
	accountId: string,
	accountType: 'RETAILER' | 'SUPPLIER',
	userId: string,
	correlationId: string,
	itemType: string,
	clUuid: string,
	sourceIpAddress: string
}

enum TradingPartnerStatus{
    onboarding = 'onboarding',
    active = 'active',
    paused='paused',
    terminated = 'terminated'
  }

type SQLTimestamp = string;
export type IsoString = string;


interface TradingPartner {
    accountId: OauthAccessToken['account_id'];
    activeDate?: IsoString;
    status : TradingPartnerStatus;
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

export async function overridesSmallBatch(channelOverrides: ChannelOverride[], sourceIpAddress: string, retialerId_s: string, awsRequestId: string, correlationId: string): Promise<void> {
	const botId = 'apiv3_catalog_overrides_small_batch_to_catalog_item_overrides';
	const retailerId = parseInt(retialerId_s);
	validateChannelOverrides(channelOverrides);
	const tradingPartnerIdDictionary = await getTradingPartnerIdDictionary(retailerId);
	const targetStream = getWritableStream(botId, queues.CATALOG_OVERRIDE);
    const metaData = {
        correlationId,
        sourceIpAddress,
        accountType: 'RETAILER',
        userId: retialerId_s,
        createDate: new Date(),
        clUuid: awsRequestId
    } as s3MetaData;
    const retailerContext: RetailerContext = {
        retailerId,
        tradingPartnerIdDictionary,
        metaData: metaData
    };

    for (const channelOverride of channelOverrides) {
        if (await toItemOverridesStream(
            channelOverride,
            retailerContext,
            targetStream
        )) {
			const error = new Error(`error sending to stream '${queues.CATALOG_OVERRIDE}'`);
			error.name = 'overridesSmallBatch.errorSendingToStream';
			throw error;
		}
    }

}


export async function toItemOverridesStream(
    channelOverride: ChannelOverride,
    retailerContext: RetailerContext,
    targetStream: Writable
): Promise<boolean> {
    let thereWasAnError = false;
    try {
        const itemOverride = createItemOverride(channelOverride, retailerContext);
        targetStream.write(itemOverride);
    } catch (e) {
        thereWasAnError = true;
        console.error({
                message: 'error processing item override',
                retailerId: retailerContext.retailerId,
                sourceIpAddress: retailerContext.metaData.sourceIpAddress,
                correlationId: retailerContext.metaData.correlationId,
                clUuid: retailerContext.metaData.clUuid,
                error: e,
                override: channelOverride,
                stream: queues.CATALOG_OVERRIDE
            }
        );
    }
    return thereWasAnError;
}

export function getWritableStream(
    botId: string,
    destination: string,
    writeConfig = {}
): Writable {
    return leo.load(botId, destination, writeConfig);
}

const MAX_REQUESTS = 50;
export async function getTradingPartnerIdDictionary(retailerId: number): Promise<Map<string, string>> {
    const tradingPartners = await getAllActiveTradingPartners(retailerId);
    console.info(`Got trading partners ${JSON.stringify(tradingPartners)}`);

    const tradingPartnerIdDictionary = new Map();
    tradingPartners.forEach((tradingPartner) => {
        if (tradingPartner?.tradingPartnerId) {
            tradingPartnerIdDictionary.set(tradingPartner.tradingPartnerId, tradingPartner.accountId);
        } else {
			console.warn({message: 'tradingPartner without tradingPartnerId', tradingPartner: tradingPartner});
		}
    });
    return tradingPartnerIdDictionary;
}

export function validateChannelOverrides(channelOverrides: ChannelOverride[]): void
{
    if (!channelOverrides || channelOverrides.length === 0) {
        const error = new Error('Missing array of item overrides');
        error.name = 'validateChannelOverrides.missingOverrides';
        throw error;
    }

    const totalOverrides = channelOverrides.length;
    if (totalOverrides > MAX_REQUESTS) {
        const error = new Error(`Total item overrides exceeds maximum ${MAX_REQUESTS}: ${totalOverrides}.  Use LargeBatch instead.`);
        error.name = 'validateChannelOverrides.tooManyOverrides';
        throw error;
    }


    for (const channelOverride of channelOverrides) {
        validateOneChannelOverride(channelOverride);
    }
}

function validateOneChannelOverride(override: ChannelOverride) {
    if (hasForeignKeys(override, ChannelOverride.fields)) {
        const error = new Error('selector: foreign keys detected');
        error.name = 'validateChannelOverrides.foreignKeys';
        throw error;
    }

    if (hasForeignKeys(override.replacements, ItemReplacements.fields)) {
        const error = new Error('selector: foreign keys detected');
        error.name = 'validateChannelOverrides.foreignKeys';
        throw error;
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
        const error = new Error('invalid channelOverride');
        error.name = 'validateChannelOverrides.invalidChannelOverride';
        throw error;
    }
}

function hasForeignKeys(obj: Record<string, unknown>, validKeys: Set<string>): boolean {
    for (const k in obj) {
        if (!validKeys.has(k)) {
            return true;
        }
    }

    return false;
}

function belongsToEnumOrUndefined<T extends { [key: number]: string | number }>(
    v: any,
    e: T
): boolean {
    return v === undefined || v in e;
}

async function getAllActiveTradingPartners(retailerId: number): Promise<TradingPartner[]> {
    const account = await getAccount(retailerId);
	const tradingPartnerList = (account.connections || [])
		.filter((connection) => {
			return isSupplierActive(connection);
		})
		.map((connection) => {
			return {
				accountId: connection.account_id_string,
				status: getTradingPartnerStatusFromConnectionStatus(connection.status), // because it is required
				tradingPartnerId: connection.trading_partner_id
			} as TradingPartner;
		});
	return tradingPartnerList;
}
async function getAccount(accountId: number): Promise<AccountElasticsearch> {
    const result = await getAccounts([accountId]);
    return result[accountId];
}

async function getAccounts(accountIds: number[]): Promise<{[accountId: number]: AccountElasticsearch}> {
    if (accountIds.length === 0) {
        // @ts-ignore
        return {};
    }

    if (client === null) {
		console.error('config: ', config);
        client = getElasticsearchClient(config.elasticsearch.AccountDomainEndpoint, config.region);
    }
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
                data = await client.search<AccountElasticsearch>(
                    {
                        index: 'account',
                        body: {
                            query: {
                                bool: {
                                    filter: [
                                        {
                                            terms: {
                                                account_id: nonCachedIds
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    },
                );
            } catch (ex) {
                lastEsError = ex;
                console.warn(`ES:getAccount warning : ${ex}`);
                retries--;
            }
        }

        if (!data) {
            if (lastEsError) throw lastEsError; else throw new Error(`Unable to find account data for ${nonCachedIds}`);
        }

        data.hits.hits.forEach((r: { _source: AccountElasticsearch; }) => {
            response[r._source.account_id] = r._source;

            //add to the cache
            // logz.debug(`v3cache store for: accountId_${r._source.account_id}`);
            cacheSet(`accountId_${r._source.account_id}`, r._source);
            // console.log(`accounts::getDataForAll ${r._source.account_id}: ${JSON.stringify(r._source,null,2)}`);
        });

// logz.info(`>>> response (new): ${JSON.stringify(response)}`);
        return response;
    }
}

function getElasticsearchClient(host: string, region: string, options = {}): es.Client {
	// console.log(`host: '${host}, region: '${region}`);
    const elasticsearchConfig = Object.assign({
        awsConfig: new AWS.Config({
            region: region
        }),
        connectionClass: require('http-aws-es'),
        host: {
			protocol: 'https',
			host: host,
			port: '443',
			path: '/',
		},
        // timeout: '1000000m',
        requestTimeout: 3000
    }, options);

    return new es.Client(elasticsearchConfig);
}

interface LruObject {
    payload: any;
    expiresAt: Date;
}

function cacheGet(key: string): any|undefined {
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

function cacheSet(key: string, payload: any) {
    // console.log(`XXX adding ${key} to the cache`);
    cache[key] = {
        payload: payload,
        expiresAt: getExpiresAt()
    };
}

function cacheClearItem(key: string) {
    // console.log(`XXX removing ${key} from the cache`);
    delete cache[key];
}

function cacheClear() {
    cache = {};
}

function getExpiresAt(): Date {
  return new Date((new Date()).getTime() + (1000 * 60 * 5));
}

function getTradingPartnerStatusFromConnectionStatus(cStatus : ConnectionStatus) : TradingPartnerStatus {
    switch (cStatus){
        case 'terminated': return TradingPartnerStatus.terminated;
        case 'on-hold': return TradingPartnerStatus.onboarding;
        case 'stopped': return TradingPartnerStatus.paused;
        default: return TradingPartnerStatus.active;
    }
}
function createItemOverride(
    override: ChannelOverride,
    retailerContext: RetailerContext
): ItemSkuOverrideLeoEvent {
    if (!(override.dscoItemId || override.supplierId)) {
        override = addSupplierId(retailerContext.tradingPartnerIdDictionary, retailerContext.retailerId, override);
    }

    const itemOverrideCorrelationId = uuid.v4();
    const itemOverride = {
        createDate: retailerContext.metaData.createDate || new Date(),
        accountId: retailerContext.retailerId.toString(),
        accountType: retailerContext.metaData.accountType,
        userId: retailerContext.metaData.userId,
        channelOverride: override,
        correlationId: itemOverrideCorrelationId,
        sourceIpAddress: retailerContext.metaData.sourceIpAddress,
        clUuid: retailerContext.metaData.clUuid
    } as ItemSkuOverrideLeoEvent;
    return itemOverride;
}

function addSupplierId(tradingPartnerIdDictionary: Map<string, string>, retailerId: number, override: ChannelOverride): ChannelOverride {
    if (!override.tradingPartnerId) {
        console.info({
            message: 'addSupplierId called without override.tradingPartnerId', 
            retailerId: retailerId, 
            channelOverride: override
        });
        const error = new Error('Missing required override.tradingPartnerId');
        error.name = 'addSupplierId.tradingPartnerId.missing';
		Object.assign(error, {override});
        throw error;
    }
	const tradingPartnerId = override.tradingPartnerId;
    const newOverride = JSON.parse(JSON.stringify(override)) as ChannelOverride;
	console.info({
		message: 'searching for',
		tradingPartnerId: tradingPartnerId,
		tradingPartnerIdDictionary: tradingPartnerIdDictionary}
	);
    const supplierId = tradingPartnerIdDictionary.get(tradingPartnerId);
    if (!supplierId) {
		console.error({
            message: 'SupplierId not found', 
            retailerId: retailerId, 
            tradingPartnerId: tradingPartnerId
        });
        const error = new Error(`SupplierId not found for [${retailerId}, ${tradingPartnerId}]`);
        error.name = 'addSupplierId.tradingPartnerId.notFound';
		Object.assign(error, {override});
        throw error;
    }
    newOverride.supplierId = supplierId;
	console.info({
        message: 'updated ChannelOverride', 
        newOverride: newOverride
    });
    return newOverride;
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