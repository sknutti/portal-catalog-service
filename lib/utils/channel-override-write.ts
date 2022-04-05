'use strict';
/* eslint-disable @typescript-eslint/no-var-requires */ //This is for config

import { APIGatewayProxyEvent } from 'aws-lambda';
import { ChannelOverride, ListingStatus, ItemSkuOverrideLeoEvent, ItemReplacements } from '@dsco/bus-models';
import { Writable } from 'stream';
import { RetailModel } from '@dsco/bus-models/dist/retail-model';
import { v4 as uuidv4 } from 'uuid';
import * as AWS from 'aws-sdk';
import * as es from 'elasticsearch';
import { AccountElasticsearch, ConnectionStatus } from '@dsco/ts-models';

const config = require('leo-config');
config.bootstrap(require('../../leo_config'));
const leo = require('leo-sdk')(expandConfig(config.leosdk));

type SQLTimestamp = string;
type IsoString = string;

interface LruObject {
    payload: any;
    expiresAt: Date;
}

interface AccountElasticsearchConnection {
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
    trading_partner_parent_id?: string;
}

const cache: {
    [key: string]: LruObject;
} = {};

interface ValidateResults {
    validated: boolean;
    message?: string;
    overrides: ChannelOverride[];
    extras?: any[];
}
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

/**
 *
 */
export async function overridesSmallBatch(
    channelOverrides: ChannelOverride[],
    sourceIpAddress: string,
    retailerId_s: string,
    awsRequestId: string,
    correlationId: string,
): Promise<void> {
    const botId = 'api_channel-override-write';
    const retailerId = parseInt(retailerId_s);
    validateChannelOverrides(channelOverrides, awsRequestId);
    const tradingPartnerIdDictionary = await getTradingPartnerIdDictionary(retailerId);
    const targetStream = getWritableStream(botId, queues.CATALOG_OVERRIDE);

    const metaData: s3MetaData = {
        correlationId,
        sourceIpAddress,
        accountType: 'RETAILER',
        userId: retailerId_s,
        createDate: new Date(),
        clUuid: awsRequestId,
        accountId: retailerId_s,
        itemType: '',
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

    targetStream.end();
}

function generateNewUUIDv4() {
    return uuidv4();
}

// catalog_item_overrides utilities
function validateChannelOverrides(overrides: any[], clUuid: string): boolean {
    return overrides
        .map((override) => validateOneChannelOverride(override, clUuid))
        .reduce((lastResult, currentValue) => lastResult && currentValue);
}

function validateOneChannelOverride(override: ChannelOverride, clUuid: string): boolean {
    if (hasForeignKeys(override, ChannelOverride.fields)) {
        return false;
    }

    if (hasForeignKeys(override.replacements, ItemReplacements.fields)) {
        return false;
    }

    let isValid = false;

    if (isItemSelectorValid(override)) {
        // since ItemReplacements is just a TS "interface" - it doesn't cause anything to fail if they stick random stuff in the replacements collection
        // verify that we have at least one replacement ---
        // TODO (CAT-324) Create an exported set of valid replacement types next to the ItemReplacements interface (bus-models)
        isValid =
            Object.keys(override.replacements).length >= 1 &&
            Object.keys(override.replacements).every((k) => ['partnerSku', 'listingStatus', 'retailModel'].includes(k));
        isValid = isValid && belongsToEnumOrUndefined(override.replacements?.listingStatus, ListingStatus);
        isValid = isValid && override.replacements?.retailModels !== undefined;
        override.replacements?.retailModels?.forEach((retailModel) => {
            isValid = isValid && belongsToEnumOrUndefined(retailModel, RetailModel);
        });
    }

    if (override.replacements.partnerSku) {
        isValid = isValid && typeof override.replacements?.partnerSku === 'string';
    }

    return isValid;
}

function validateEvent(event: APIGatewayProxyEvent, clUuid: string, maxRequests = 10): ValidateResults {
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

function addSupplierId(
    tradingPartnerIdDictionary: Map<string, string>,
    retailerId: number,
    override: ChannelOverride,
): ChannelOverride {
    if (!override.tradingPartnerId) {
        const error = new Error('Missing required override.tradingPartnerId');
        error.name = 'addSupplierId.tradingPartnerId.missing';
        Object.assign(error, { override });
        throw error;
    }
    const tradingPartnerId = override.tradingPartnerId;
    const newOverride = JSON.parse(JSON.stringify(override)) as ChannelOverride;
    const supplierId = tradingPartnerIdDictionary.get(tradingPartnerId);
    if (!supplierId) {
        const error = new Error(`SupplierId not found for [${retailerId}, ${tradingPartnerId}]`);
        error.name = 'addSupplierId.tradingPartnerId.notFound';
        Object.assign(error, { override });
        throw error;
    }
    newOverride.supplierId = supplierId;

    return newOverride;
}

export interface RetailerContext {
    retailerId: number;
    tradingPartnerIdDictionary: Map<string, string>;
    metaData: s3MetaData;
}

/**
 * Create an ItemSkuOverrideLeoEvent object to write to data stream
 */
export function createItemOverride(
    override: ChannelOverride,
    retailerContext: RetailerContext,
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
        clUuid: retailerContext.metaData.clUuid,
    };
    return itemOverride;
}

async function write(stream: any, payload: any): Promise<void> {
    console.log('starting to write');
    if (
        !stream.write(payload, (e: any) => (e === undefined ? console.log('no callback error') : console.log('cb', e)))
    ) {
        console.log('stream needs to drain');
        return new Promise((resolve) => {
            stream.once('drain', () => {
                resolve();
            });
        });
    } else {
        console.log('write to GTG');
        return new Promise((resolve) => {
            resolve();
        });
    }
}

async function toItemOverridesStream(
    channelOverride: ChannelOverride,
    retailerContext: RetailerContext,
    targetStream: Writable,
): Promise<boolean> {
    let thereWasAnError = true;
    try {
        const itemOverride = createItemOverride(channelOverride, retailerContext);
        console.log('itemOverride is ', itemOverride);
        await write(targetStream, itemOverride);
        thereWasAnError = false;
    } catch (e) {
        console.log('error in toItemOverridesStream', e);
    }
    return thereWasAnError;
}

const excludedStatus: Set<ConnectionStatus> = new Set(['terminated']);

function isSupplierActive(connection: AccountElasticsearchConnection): boolean {
    return !excludedStatus.has(connection.status);
}

async function getAllActiveTradingPartners(retailerId: number): Promise<TradingPartner[]> {
    const account = await getAccount(retailerId);
    if (account === undefined) {
        throw new Error(`Unable to find account for ${retailerId}`);
    }
    const tradingPartnerList = (account?.connections || [])
        .filter((connection: any) => {
            return isSupplierActive(connection);
        })
        .map((connection: any) => {
            return {
                accountId: connection.account_id_string,
                status: getTradingPartnerStatusFromConnectionStatus(connection.status), // because it is required
                tradingPartnerId: connection.trading_partner_id,
            } as TradingPartner;
        });
    return tradingPartnerList;
}

async function getTradingPartnerIdDictionary(retailerId: number): Promise<Map<string, string>> {
    const tradingPartners = await getAllActiveTradingPartners(retailerId);
    console.log(`Got trading partners ${JSON.stringify(tradingPartners)}`);
    const tradingPartnerIdDictionary = new Map();
    tradingPartners.forEach((tradingPartner: any) => {
        if (tradingPartner?.tradingPartnerId) {
            tradingPartnerIdDictionary.set(tradingPartner.tradingPartnerId, tradingPartner.accountId);
        } else {
            console.log('warning on getTrading PartnerId Dictionary');
        }
    });
    return tradingPartnerIdDictionary;
}

function mapReplacer(key: any, value: any): { dataType: string; value: any } | any {
    if (value instanceof Map) {
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
            response[accountId] = data;
        } else {
            nonCachedIds.push(accountId);
        }
    }

    if (nonCachedIds.length === 0) {
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
            cacheSet(`accountId_${r._source.account_id}`, r._source);
        });

        return response;
        // eslint-disable-next-line no-empty
    } finally {
    }
}

function getElasticsearchClient(host: string, region: string, options = {}): es.Client {
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
        return obj.payload;
    } else {
        return undefined;
    }
}

function expandConfig(sdk: any) {
    return {
        region: sdk.Region,
        resources: sdk,
        firehose: sdk.LeoFirehoseStream,
        kinesis: sdk.LeoKinesisStream,
        s3: sdk.LeoS3,
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
function getWritableStream(botId: string, destination: string, writeConfig = {}): Writable {
    return leo.load(botId, destination, writeConfig);
}

function isItemSelectorValid(selector: Partial<ChannelOverride>): boolean {
    return (
        !!selector.dscoItemId ||
        ((!!selector.supplierId || !!selector.tradingPartnerId) &&
            (!!selector.ean ||
                !!selector.gtin ||
                !!selector.isbn ||
                !!selector.mpn ||
                !!selector.partnerSku ||
                !!selector.sku ||
                !!selector.upc))
    );
}
