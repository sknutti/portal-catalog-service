import AWS from 'aws-sdk';

export const DDB_CLIENT = new AWS.DynamoDB({apiVersion: '2012-08-10'});
export class SpreadsheetDynamoTable {
    private static tableName = process.env.SPREADSHEET_TABLE!;


    static async getItem(supplierId: number, retailerId: number, categoryPath: string): Promise<SpreadsheetRecord | undefined> {
        const Key: Pick<SpreadsheetDynamoRecord, 'supplierId' | 'fullPath'> = {
            supplierId: {
                S: supplierId.toString(10)
            },
            fullPath: {
                S: getFullPath(retailerId, categoryPath)
            }
        };

        const resp = await DDB_CLIENT.getItem({
            TableName: this.tableName,
            AttributesToGet: COL_NAMES.filter(name => name !== 'supplierId' && name !== 'fullPath'),
            Key
        }).promise();

        return resp.Item ? createRecord(resp.Item as SpreadsheetDynamoRecord, {supplierId, retailerId, categoryPath}) : undefined;
    }

    static async putItem(record: SpreadsheetRecord): Promise<void> {
        const Item: SpreadsheetDynamoRecord = {
            supplierId: {S: record.supplierId.toString(10)},
            fullPath: {S: getFullPath(record.retailerId, record.categoryPath)},
            spreadsheetId: {S: record.spreadsheetId},
            scriptId: {S: record.scriptId},
            scriptVersion: {S: record.scriptVersion},
            lastUpdateDate: {S: record.lastUpdateDate.toISOString()}
        };

        await DDB_CLIENT.putItem({
            TableName: this.tableName,
            Item
        }).promise();
    }

    static async deleteItem(supplierId: number, retailerId: number, categoryPath: string): Promise<void> {
        const Key: Pick<SpreadsheetDynamoRecord, 'supplierId' | 'fullPath'> = {
            supplierId: {
                S: supplierId.toString(10)
            },
            fullPath: {
                S: getFullPath(retailerId, categoryPath)
            }
        };

        await DDB_CLIENT.deleteItem({
            TableName: this.tableName,
            Key
        }).promise();
    }

    /**
     * Marks the spreadsheet as updated - updates the script version and last update date
     */
    static async markItemAsUpdated(supplierId: number, retailerId: number, categoryPath: string, scriptVersion: string, lastUpdateDate: Date): Promise<void> {
        const Key: Pick<SpreadsheetDynamoRecord, 'supplierId' | 'fullPath'> = {
            supplierId: {
                S: supplierId.toString(10)
            },
            fullPath: {
                S: getFullPath(retailerId, categoryPath)
            }
        };
        const versionColName: ColName = 'scriptVersion';
        const dateColName: ColName = 'lastUpdateDate';

        await DDB_CLIENT.updateItem({
            TableName: this.tableName,
            Key,
            UpdateExpression: `SET ${versionColName} = :${versionColName}, ${dateColName} = :${dateColName}`,
            ExpressionAttributeValues: {
                [`:${versionColName}`]: {
                    S: scriptVersion
                },
                [`:${dateColName}`]: {
                    S: lastUpdateDate.toISOString()
                }
            }
        }).promise();
    }
}

/**
 * This is the data that can be set / retrieved from the table
 */
export interface SpreadsheetRecord {
    supplierId: number;
    retailerId: number;
    categoryPath: string;
    spreadsheetId: string;
    scriptId: string;
    scriptVersion: string;
    lastUpdateDate: Date;
}

// These are the actual columns stored in dynamo
const COL_NAMES = [
    'supplierId', // The hash value
    'fullPath', // The range value - a concatenation of retailerId||categoryPath
    'spreadsheetId',
    'scriptId',
    'scriptVersion',
    'lastUpdateDate'
] as const;

type ColName = typeof COL_NAMES[number];

/**
 * This is how the data actually looks in dynamo
 */
type SpreadsheetDynamoRecord = Record<ColName, { S: string }>


function getFullPath(retailerId: number, categoryPath: string): string {
    return `${retailerId}||${categoryPath}`;
}

function extractFromFullPath(path: string): { retailerId: number, categoryPath: string } {
    const idx = path.indexOf('|');
    return {
        retailerId: +path.slice(0, idx),
        categoryPath: path.slice(idx + 2)
    };
}

function createRecord(map: SpreadsheetDynamoRecord, partial: Partial<SpreadsheetRecord> = {}): SpreadsheetRecord {
    const extracted = map.fullPath ? extractFromFullPath(map.fullPath.S) : undefined;

    return {
        supplierId: partial.supplierId || +map.supplierId.S,
        retailerId: partial.retailerId || extracted!.retailerId,
        categoryPath: partial.categoryPath || extracted!.categoryPath,
        spreadsheetId: partial.spreadsheetId || map.spreadsheetId.S,
        scriptId: partial.scriptId || map.scriptId.S,
        scriptVersion: partial.scriptVersion || map.scriptVersion.S,
        lastUpdateDate: partial.lastUpdateDate || new Date(map.lastUpdateDate.S)
    };
}
