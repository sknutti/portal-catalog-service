import { randomInt } from '@lib/utils';
import axios from 'axios';
import {
    getTopLevelCategoryNames,
    initAWSCredentials,
    locallyInvokeGenerateSpreadsheetApi,
    locallyInvokeGetSpreadsheetUploadUrlApi,
    locallyInvokePublishBot,
} from '../test-utils';

// Aidan Test Retailer
const retailerId = 1000012301;
// Aidan Test Supplier
const userId = 26366;

// Note: This test requires the dsco vpn to run as it uses both Mongo and Gearman
test.skip('it successfully generates a catalog spreadsheet that can be re-uploaded', async () => {
    const identityId = await initAWSCredentials(userId);

    const randomCategory = await getRandomCategoryPath();
    const generatedSpreadsheet = await locallyInvokeGenerateSpreadsheetApi(randomCategory, retailerId, identityId);

    const uploadUrl = await locallyInvokeGetSpreadsheetUploadUrlApi(randomCategory, retailerId, identityId);

    // Write the generated spreadsheet to the s3 bucket
    await axios.put(uploadUrl, generatedSpreadsheet, { maxRedirects: 0, maxContentLength: Infinity });

    await locallyInvokePublishBot(uploadUrl);
}, 360_000);

async function getRandomCategoryPath() {
    const categoryPaths = await getTopLevelCategoryNames(retailerId);

    return categoryPaths[randomInt(0, categoryPaths.length - 1)];
}
