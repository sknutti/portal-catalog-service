import type { PublishCategorySpreadsheetEvent } from '@bot/publish-category-spreadsheet/publish-category-spreadsheet';
import { DscoEnv } from '@dsco/ts-models';
import { getDscoEnv, getIsRunningLocally } from '@lib/environment';
import * as AWS from 'aws-sdk';

export function getFanaticsAccountForEnv(): Account | undefined {
    return accounts[getDscoEnv()];
}

export function isFanatics(supplierId: number): boolean {
    return !getIsRunningLocally() && supplierId === getFanaticsAccountForEnv()?.supplierId;
}


const MAX_ROWS_PER_INVOCATION = 20_000;

export async function fanoutIfLargeSpreadsheetAndFanatics(dataRowCount: number, event: PublishCategorySpreadsheetEvent): Promise<void> {
    if (!isFanatics(event.supplierId) || dataRowCount < MAX_ROWS_PER_INVOCATION || event.fromRowIdx || event.toRowIdx) {
        return;
    }

    console.warn(`Found spreadsheet with ${dataRowCount} rows, fanning out.`);

    const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });

    const childInvocations: Promise<any>[] = [];

    let from = 0;
    let to = MAX_ROWS_PER_INVOCATION;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const newEvent: PublishCategorySpreadsheetEvent = {
            ...event,
            // Plus one for the header row
            fromRowIdx: from + 1,
            // Plus one for the header row
            toRowIdx: to + 1
        };
        console.warn('Spawning child invocation', newEvent);

        childInvocations.push(
          lambda
              .invoke({
                  FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME!,
                  InvocationType: 'Event',
                  Payload: JSON.stringify(newEvent),
              })
              .promise()
        );

        if (to > dataRowCount) {
            break;
        }

        from = to;
        to += MAX_ROWS_PER_INVOCATION;
    }

    await Promise.all(childInvocations);

    throw new FanaticsFanoutError(dataRowCount);
}

interface FanaticsErrors {
    genericMessage?: string;
    rowWithError?: number;
    validationErrors?: string[];
}

function fanaticsErrorsToTable(errors: FanaticsErrors): string {
    let result = '';

    if (errors.rowWithError) {
        result += `<tr><td>Row With Error</td><td>${errors.rowWithError}</td></tr>`;
    }
    if (errors.genericMessage) {
        result += `<tr><td>Error</td><td>${errors.genericMessage}</td></tr>`;
    }
    if (errors.validationErrors?.length) {
        result += `<tr><td>Validation Errors</td><td><ul><li>${errors.validationErrors.join('</li><li>')}</li></ul></td></tr>`;
    }

    return result;
}

export async function sendFanaticsEmail(event: Pick<PublishCategorySpreadsheetEvent, 'supplierId' | 's3Path' | 'uploadTime'>, errors: FanaticsErrors): Promise<void> {
    let toAddresses = ['agrant@commercehub.com']; // jkerr@fanatics.com

    if (process.env.SEND_EMAIL_TEST === 'true') {
        toAddresses = ['success@simulator.amazonses.com'];
    } else if (getIsRunningLocally() || !isFanatics(event.supplierId)) {
        return;
    }
    console.error('Sending Fanatics Email For These Errors: ', errors);

    const ses = new AWS.SES({apiVersion: '2010-12-01'});
    const request: AWS.SES.SendEmailRequest = {
        Source: 'notifications@dsco.io',
        Destination: {
            ToAddresses: toAddresses
        },
        Message: {
            Subject: {
                Data: 'CommerceHub Advanced Catalog Upload Error'
            },
            Body: {
                Html: {
                    Data:
`
<style>
        table {
            text-align: left;
            border-collapse: collapse;
            font-size: 16px;
        }
        
        td {
            padding: 5px 10px;
            border: 1px solid #ccc;
            vertical-align: top;
        }
        i, ul, pre {
            margin: 0;
            padding-left: 20px;
        }
</style>

<table>
    <tr><td>Environment</td><td>${getDscoEnv()}</td></tr>
    <tr><td>File</td><td>${event.s3Path}</td></tr>
    <tr><td>Upload Date</td><td>${event.uploadTime.toString()}</td></tr>
    ${fanaticsErrorsToTable(errors)}
</table>
`
                }
            }
        }
    };

    await ses.sendEmail(request).promise();
}

const accounts: Partial<Record<DscoEnv, Account>> = {
    // // In test we upload to "Aidan Test Supplier"
    // test: {
    //     supplierId: 1000012302,
    //     retailerId: 1000012301,
    //     userId: 26366,
    //     categoryPath: 'Catalog'
    // },
    staging: {
        supplierId: 1000007967,
        retailerId: 1000007220,
        userId: 1000011189,
        categoryPath: 'Fan Gear',
    },
    prod: {
        supplierId: 1000043924,
        retailerId: 1000003564,
        userId: 31615,
        categoryPath: 'Fan Gear',
    },
};

interface Account {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
}

/**
 * Used as an early-exit method from the parent invocation that
 */
export class FanaticsFanoutError extends Error {
    constructor(dataRowCount: number) {
        super(`Detected fanatics upload of ${dataRowCount} rows - split up into smaller invocations`);
    }
}
