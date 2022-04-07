import type { PublishCategorySpreadsheetEvent } from '@bot/publish-category-spreadsheet/publish-category-spreadsheet';
import { DscoEnv } from '@dsco/ts-models';
import { getDscoEnv, getIsRunningLocally } from '@lib/environment';
import * as AWS from 'aws-sdk';

export function getFanaticsAccountForEnv(): Account | undefined {
    const { retailerId } = accounts[getDscoEnv()].default;
    return accounts[getDscoEnv()][retailerId];
}

export function isFanatics(supplierId: number): boolean {
    return supplierId === getFanaticsAccountForEnv()?.supplierId;
}

// Try to get retailerId from the path, otherwise use the one passed in
// Path should be in the form of {env}/{id}/
// If no id or id is NaN, then use retailerId passed in
export function getRetailerIdFromPath(path: string, retailerId: number): number {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [env, id] = path.split('/');
    return Number(id) ? Number(id) : retailerId;
}

/**
 * To prevent timing out, will re-invoke the upload bot on subsets of a very large file.  Currently only enabled for fanatics (as this breaks the websocket communication)
 */
export async function fanoutIfLargeSpreadsheetAndFanatics(
    dataRowCount: number,
    event: PublishCategorySpreadsheetEvent,
    callId: string,
): Promise<void> {
    // prod is faster and can handle much larger invocations
    const MAX_ROWS_PER_INVOCATION = getDscoEnv() === 'prod' ? 25_000 : 10_000;

    if (!isFanatics(event.supplierId) || dataRowCount < MAX_ROWS_PER_INVOCATION || event.fromRowIdx || event.toRowIdx) {
        return;
    }

    console.warn(`[${callId}] - Found spreadsheet with ${dataRowCount} rows, fanning out.`);

    const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });

    const childInvocations: Promise<any>[] = [];

    let from = 0;
    let to = MAX_ROWS_PER_INVOCATION;
    let count = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const newEvent: PublishCategorySpreadsheetEvent = {
            ...event,
            callId: `${callId}-fanout-${count}`,
            // Plus one for the header row
            fromRowIdx: from + 1,
            // Plus one for the header row
            toRowIdx: to + 1,
        };
        console.warn('Spawning child invocation', newEvent);

        childInvocations.push(
            lambda
                .invoke({
                    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME!,
                    InvocationType: 'Event',
                    Payload: JSON.stringify(newEvent),
                })
                .promise(),
        );

        if (to > dataRowCount) {
            break;
        }

        from = to;
        to += MAX_ROWS_PER_INVOCATION;
        count += 1;
    }

    await Promise.all(childInvocations);

    throw new FanaticsFanoutError(dataRowCount);
}

interface FanaticsErrors {
    genericMessage?: string;
    rowWithError?: number;
    validationErrors?: string[];
    callId: string;
}

function fanaticsErrorsToTable(errors: FanaticsErrors): string {
    let result = '';

    if (errors.callId) {
        result += `<tr><td>Call Id</td><td>${errors.callId}</td></tr>`;
    }
    if (errors.rowWithError) {
        result += `<tr><td>Row With Error</td><td>${errors.rowWithError}</td></tr>`;
    }
    if (errors.genericMessage) {
        result += `<tr><td>Error</td><td>${errors.genericMessage}</td></tr>`;
    }
    if (errors.validationErrors?.length) {
        result += `<tr><td>Validation Errors</td><td><ul><li>${errors.validationErrors.join(
            '</li><li>',
        )}</li></ul></td></tr>`;
    }

    return result;
}

export async function sendFanaticsEmail(
    event: Pick<PublishCategorySpreadsheetEvent, 'supplierId' | 's3Path' | 'sourceS3Path' | 'uploadTime'>,
    errors: FanaticsErrors,
): Promise<void> {
    let toAddresses = ['agrant@commercehub.com', 'jkerr@fanatics.com', 'dboles@fanatics.com'];

    if (process.env.SEND_EMAIL_TEST === 'true') {
        toAddresses = ['success@simulator.amazonses.com'];
    } else if (getIsRunningLocally() || !isFanatics(event.supplierId)) {
        return;
    }
    console.error('Sending Fanatics Email For These Errors: ', errors);

    const sourceFile = event.sourceS3Path ? `<tr><td>Source File</td><td>${event.sourceS3Path}</td></tr>` : '';

    const ses = new AWS.SES({ apiVersion: '2010-12-01' });
    const request: AWS.SES.SendEmailRequest = {
        Source: 'notifications@dsco.io',
        Destination: {
            ToAddresses: toAddresses,
        },
        Message: {
            Subject: {
                Data: 'CommerceHub Advanced Catalog Upload Error',
            },
            Body: {
                Html: {
                    Data: `
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
    ${sourceFile}
    <tr><td>File</td><td>${event.s3Path}</td></tr>
    <tr><td>Upload Date</td><td>${event.uploadTime.toString()}</td></tr>
    ${fanaticsErrorsToTable(errors)}
</table>
`,
                },
            },
        },
    };

    await ses.sendEmail(request).promise();
}

// The default record is the one we use if there is no retailerId
const accounts: Record<DscoEnv, AccountCategoryPath> = {
    dev: {},
    test: {
        // // Aidan Test Retailer
        // 1000012301: {
        //     retailerId: 1000012301,
        //     supplierId: 1000012302, // Aidan Test Supplier
        //     userId: 26366,
        //     categoryPath: 'Catalog',
        // },
        default: {
            retailerId: 1000012301, // Aidan Test Retailer
            supplierId: 1000012302,
            userId: 0,
            categoryPath: '',
        },
    },
    staging: {
        // AAFES
        1000007723: {
            retailerId: 1000007723,
            supplierId: 1000007967,
            userId: 1000011189,
            categoryPath: 'Fan Gear cat1560015',
        },
        // Dsco Retailer Demo
        1000007220: {
            retailerId: 1000007220,
            supplierId: 1000007967,
            userId: 1000011189,
            categoryPath: 'Fan Gear',
        },
        default: {
            retailerId: 1000007220, // Dsco Retailer Demo
            supplierId: 1000007967,
            userId: 0,
            categoryPath: '',
        },
    },
    prod: {
        // AAFES
        1000013240: {
            retailerId: 1000013240,
            supplierId: 1000043924,
            userId: 31615,
            categoryPath: 'Fan Gear cat1560015',
        },
        // Nordstrom
        1000003564: {
            retailerId: 1000003564,
            supplierId: 1000043924,
            userId: 31615,
            categoryPath: 'Fan Gear',
        },
        default: {
            retailerId: 1000003564, // Nordstrom
            supplierId: 1000043924,
            userId: 0,
            categoryPath: '',
        },
    },
};
interface Account {
    retailerId: number;
    supplierId: number;
    userId: number;
    categoryPath: string;
}
interface AccountCategoryPath {
    [retailerId: string]: Account;
}

/**
 * Used as an early-exit method from the parent invocation that
 */
export class FanaticsFanoutError extends Error {
    constructor(dataRowCount: number) {
        super(`Detected fanatics upload of ${dataRowCount} rows - split up into smaller invocations`);
    }
}
