import { DscoEnv } from '@dsco/ts-models';
import axios from 'axios';
import { promises as fs } from 'fs';
import * as inquirer from 'inquirer';
import { setupEnvironmentForRunningLocally } from '../lib/environment';
import { assertUnreachable } from '../lib/utils';
import { setTestWebsocketHandler } from '../lib/utils/send-websocket-event';
import {
    getTopLevelCategoryNames,
    initAWSCredentials,
    locallyInvokeGenerateSpreadsheetApi,
    locallyInvokeGetAssortmentsApi,
    locallyInvokeGetSpreadsheetUploadUrlApi,
    locallyInvokePublishBot,
    locallyInvokeGetContentExceptionsApi,
    TEST_ACCOUNTS,
    TestAccount,
} from '../test/test-utils';

const testTypes: Record<TestType, TestTypeDef> = {
    upload: {
        name: 'Upload Category Spreadsheet',
        categoryMessage: 'What category would you like to upload to?',
        fileMessage: 'What spreadsheet would you like to upload?',
        fileTypes: ['xlsx', 'csv'],
        modifiesData: true,
    },
    generate: {
        name: 'Generate Category Spreadsheet',
        categoryMessage: 'What category would you like to generate from?',
        fileMessage: 'What file would you like to save the generated spreadsheet to?',
        fileTypes: ['xlsx'],
    },
    getUploadUrl: {
        name: 'Get Presigned Spreadsheet Upload Url',
        categoryMessage: 'What category would you like a presigned upload url for?',
    },
    getAssortments: {
        name: 'Get Assortments',
    },
    getContentExceptions: {
        name: 'Get Content Exceptions',
        // TODO CCR will probably want to add more info here
    },
};
type TestType = 'upload' | 'generate' | 'getUploadUrl' | 'getAssortments' | 'getContentExceptions';

interface TestTypeDef {
    name: string;
    categoryMessage?: string;
    fileMessage?: string;
    fileTypes?: string[];
    modifiesData?: boolean;
}

async function main() {
    // Enable assertions outside jest tests
    (global as any).expect = require('expect');

    const prompt = await inquirer.prompt<{
        testType: TestType;
        account: TestAccount;
        environment: Exclude<DscoEnv, 'dev'>;
    }>([
        {
            type: 'list',
            name: 'testType',
            message: 'What type of test would you like to run?',
            choices: Object.entries(testTypes).map(([value, { name }]) => ({ name, value })),
        },
        {
            type: 'list',
            name: 'account',
            message: 'Which account do you want to test with?',
            choices: Object.entries(TEST_ACCOUNTS).map(([name, value]) => ({ name, value })),
        },
        { type: 'list', name: 'environment', choices: (prompt) => Object.keys(prompt.account) },
    ]);

    const { retailerId, userId, isRealCustomer, defaultCategoryPath } = prompt.account[prompt.environment]!;
    const { environment, testType } = prompt;
    const testTypeDef = testTypes[testType];

    if (isRealCustomer && testTypeDef.modifiesData) {
        const confirmPrompt = await inquirer.prompt<{ confirm: boolean }>([
            {
                type: 'confirm',
                name: 'confirm',
                message:
                    'WARNING: You are about to modify data for a real customer account. Are you sure you want to continue?',
            },
        ]);

        if (!confirmPrompt.confirm) {
            return;
        }
    }

    // Actually run the test
    setupEnvironmentForRunningLocally(environment);
    const identityId = await initAWSCredentials(userId);

    switch (testType) {
        case 'generate':
            return await generateSpreadsheet(
                await promptCategoryPath(testTypeDef.categoryMessage!, retailerId, defaultCategoryPath),
                retailerId,
                await promptFilePath(testTypeDef.fileMessage!, 'generated-spreadsheet.xlsx'),
                identityId,
            );
        case 'upload':
            return await uploadFile(
                await promptCategoryPath(testTypeDef.categoryMessage!, retailerId, defaultCategoryPath),
                retailerId,
                await promptFilePath(testTypeDef.fileMessage!, await defaultUploadFile()),
                identityId,
            );
        case 'getUploadUrl':
            return await getUploadUrl(
                await promptCategoryPath(testTypeDef.categoryMessage!, retailerId, defaultCategoryPath),
                retailerId,
                identityId,
            );
        case 'getAssortments':
            return await getAssortments(identityId);
        case 'getContentExceptions':
            return await getContentExceptions(identityId); // TODO CCR add inputs here when we know what they are
        default:
            assertUnreachable(testType, 'testType');
    }
}

main();

async function promptFilePath(message: string, defaultPath?: string): Promise<string> {
    const resp = await inquirer.prompt<{ file: string }>([
        { type: 'input', name: 'file', message, default: defaultPath },
    ]);

    return resp.file;
}

async function defaultUploadFile(): Promise<string | undefined> {
    if (await fileExists('generated-spreadsheet.xlsx')) {
        return 'generated-spreadsheet.xlsx';
    }
}

const other = '-- Other Category (manually enter) --';

async function promptCategoryPath(message: string, retailerId: number, defaultPath?: string): Promise<string> {
    let choices = await getTopLevelCategoryNames(retailerId);
    choices = [...choices, other];
    const resp = await inquirer.prompt<{ category: string }>([
        { type: 'list', name: 'category', message, choices, default: defaultPath },
        { type: 'input', name: 'category', message, when: (p) => p.category === other, askAnswered: true },
    ]);
    return resp.category;
}

async function uploadFile(category: string, retailerId: number, filePath: string, identityId: string) {
    setTestWebsocketHandler(() => {
        // Left blank intentionally to noop sending websocket events
    });

    const uploadUrl = await locallyInvokeGetSpreadsheetUploadUrlApi(category, retailerId, identityId);

    // Write the generated spreadsheet to the presigned upload url
    await axios.put(uploadUrl, await fs.readFile(filePath));

    await locallyInvokePublishBot(uploadUrl);
    console.log(`\nSuccessfully uploaded category spreadsheet file: ${filePath}!`);
}

async function generateSpreadsheet(category: string, retailerId: number, filePath: string, identityId: string) {
    const fileBuffer = await locallyInvokeGenerateSpreadsheetApi(category, retailerId, identityId);
    await fs.writeFile(filePath, fileBuffer);
    console.log(`\nSuccessfully generated category spreadsheet file: ${filePath}!`);
}

async function getUploadUrl(category: string, retailerId: number, identityId: string) {
    const uploadUrl = await locallyInvokeGetSpreadsheetUploadUrlApi(category, retailerId, identityId);
    console.log(`\nSuccessfully generated upload url: ${uploadUrl}`);
}

async function getAssortments(identityId: string) {
    const resp = await locallyInvokeGetAssortmentsApi(identityId);
    console.log(`\nSuccessfully got assortments: ${JSON.stringify(resp, null, 4)}`);
}

async function getContentExceptions(identityId: string) {
    console.log(`\nCalling getContentExceptions with identity: ${identityId}`);
    const resp = await locallyInvokeGetContentExceptionsApi(identityId); // TODO CCR add more arguments here when we know what they will be
    console.log(`\nSuccessfully got content exceptions: ${JSON.stringify(resp, null, 4)}`);
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await fs.stat(path);
        return true;
    } catch (_) {
        return false;
    }
}
