import { CatalogSpreadsheetWebsocketEvents } from '@api/index';
import { randomInt } from '@lib/utils';
import { setTestWebsocketHandler } from '@lib/utils/send-websocket-event';
import axios from 'axios';
import {
    getTopLevelCategoryNames,
    initAWSCredentials,
    locallyInvokeGenerateSpreadsheetApi,
    locallyInvokeGetSpreadsheetUploadUrlApi,
    locallyInvokePublishBot
} from '../test-utils';

// Aidan Test Retailer
const retailerId = 1000012301;
// Aidan Test Supplier
const userId = 26366;

// Note: This test requires the dsco vpn to run as it uses both Mongo and Gearman
test('it successfully generates a catalog spreadsheet that can be re-uploaded', async () => {
    const identityId = await initAWSCredentials(userId);

    const randomCategory = await getRandomCategoryPath();
    const generatedSpreadsheet = await locallyInvokeGenerateSpreadsheetApi(randomCategory, retailerId, identityId);

    const uploadUrl = await locallyInvokeGetSpreadsheetUploadUrlApi(randomCategory, retailerId, identityId);

    // Write the generated spreadsheet to the s3 bucket
    await axios.put(uploadUrl, generatedSpreadsheet);

    let websocketSuccess = false;
    waitForWebsocketSuccess().then(() => websocketSuccess = true);

    await locallyInvokePublishBot(uploadUrl);

    expect(websocketSuccess).toBe(true);
}, 60_000);


function waitForWebsocketSuccess(): Promise<void> {
    return new Promise((resolve, reject) => {
        setTestWebsocketHandler((type, data) => {
            if (type === 'success') {
                const success = data as CatalogSpreadsheetWebsocketEvents['success'];

                if (success.rowWithError) {
                    reject(`Spreadsheet had validation errors: \n- ${success.validationMessages?.join('\n- ')}`);
                } else {
                    resolve();
                }
            } else if (type === 'error') {
                const error = data as CatalogSpreadsheetWebsocketEvents['error'];
                reject(`Invocation error: ${error.message}\n\n${error.error}`);
            }
        });
    });
}

async function getRandomCategoryPath() {
    const categoryPaths = await getTopLevelCategoryNames(retailerId);

    return categoryPaths[randomInt(0, categoryPaths.length - 1)];
}
