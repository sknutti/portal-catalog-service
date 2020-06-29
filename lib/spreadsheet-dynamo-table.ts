import AWS from 'aws-sdk';

export class SpreadsheetDynamoTable {
    private tableName = process.env.SPREADSHEET_TABLE!;
    private ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

    async getItem(supplierId: number, retailerId: number, categoryPath: string): Promise<SpreadsheetRecord | undefined> {
        const resp = await this.ddb.getItem({
            TableName: this.tableName,
            AttributesToGet: ['spreadsheetId', 'scriptId'],
            Key: {
                supplierId: {
                    S: supplierId.toString(10)
                },
                fullPath: {
                    S: this.getFullPath(retailerId, categoryPath)
                }
            }
        }).promise();

        return resp.Item ? this.createRecord(resp.Item, {supplierId, retailerId, categoryPath}) : undefined;
    }

    async putItem(record: SpreadsheetRecord): Promise<void> {
        await this.ddb.putItem({
            TableName: this.tableName,
            Item: {
                supplierId: {S: record.supplierId.toString(10)},
                fullPath: {S: this.getFullPath(record.retailerId, record.categoryPath)},
                spreadsheetId: {S: record.spreadsheetId}
            }
        }).promise();
    }

    async deleteItem(supplierId: number, retailerId: number, categoryPath: string): Promise<void> {
        await this.ddb.deleteItem({
            TableName: this.tableName,
            Key: {
                supplierId: {
                    S: supplierId.toString(10)
                },
                fullPath: {
                    S: this.getFullPath(retailerId, categoryPath)
                }
            }
        }).promise();
    }

    private getFullPath(retailerId: number, categoryPath: string): string {
        return `${retailerId}||${categoryPath}`;
    }

    private extractFromFullPath(path: string): {retailerId: number, categoryPath: string} {
        const idx = path.indexOf('|');
        return {
            retailerId: +path.slice(0, idx),
            categoryPath: path.slice(idx + 2)
        };
    }

    private createRecord(map: AWS.DynamoDB.AttributeMap, partial: Partial<SpreadsheetRecord> = {}): SpreadsheetRecord {
        const extracted = map.fullPath ? this.extractFromFullPath(map.fullPath.S!) : undefined;

        return {
            supplierId: partial.supplierId || +map.supplierId.S!,
            retailerId: partial.retailerId || extracted!.retailerId,
            categoryPath: partial.categoryPath || extracted!.categoryPath,
            spreadsheetId: partial.spreadsheetId || map.spreadsheetId.S!,
            scriptId: partial.scriptId || map.scriptId.S!
        };
    }
}

export interface SpreadsheetRecord {
    supplierId: number;
    retailerId: number;
    categoryPath: string;
    spreadsheetId: string;
    scriptId: string;
}
