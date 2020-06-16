# Portal Catalog Service
Contains a set of catalog-related apis designed to be called directly from the portal.

## Notes On Auth
This service uses an oauth refresh token to programmatically access `dsco.catalog.editor@dsco.io` 
using the Google Sheets and Google Drive apis.

If this refresh token expires (changed password, inactive for 6 months), follow the instructions here
to obtain a new one: https://stackoverflow.com/questions/19766912/how-do-i-authorise-an-app-web-or-installed-without-user-intervention

Then update [https://console.aws.amazon.com/secretsmanager/home?region=us-east-1#/secret?name=catalog-editor-google-api](this refresh token in AWS secrets manager).

## Usage
Each api exports a request object that can be used to query the api.

Example web use:

```typescript
import {signedFetch} from '@dsco/aws-auth';
import {GenerateCategorySpreadsheetRequest} from '@dsco/portal-catalog-service';

const request = new GenerateCategorySpreadsheetRequest(...);
const response = await signedFetch(request, DSCO_ENV, DSCO_CONFIG.AWS_REGION, DSCO_CONFIG.AWS_COGNITO_ID, window.AWS);
```

## Project Layout
The source for each of the lambdas can be found in `/api/function_name/`

Shared code and helper code can be found under `/lib`

## Running Locally
To start, run `npm start` which will watch for changes to your apis and 
start a server so you can test them under [localhost:3000](localhost:3000)

To set which user is logged in, head on over to `webpack.config.ts` and you'll need to change the
process.env.SLS_COGNITO_IDENTITY_ID value.  To get an identity value for a specific account and 
user...

1) Go to Dsco internal tools
1) Log in as the account that you want into the Dsco portal
1) Open up a javascript console in the browser
1) Type this in and hit enter: `AWS.config.credentials.identityId`
1) You will now see the identity ID of the logged in user in that account

## Running Tests
The jest unit test runner is used for the tests. Run `npm test` to run all tests.

The `coverage` directory will contain a code coverage report.

## Building
Use `npm run build` to create a production-ready artifact in the `build/artifact` directory.  
It will also generate an npm lib for using the artifact in the `build/lib` directory.

## Deploying
### Manual Deploy
_Note: This is not the recommended way to deploy, please use bamboo for all deployments_

If you don't have serverless installed globally, run `npm i serverless -g`.

After building, simply run `cd build/artifact/ && sls deploy --stage {stage}` to deploy to the given stage.

### Bamboo Deploy
Bamboo builds are run automatically when changes are pushed to the master branch.  New builds are automatically deployed to test.


* [Connect to VPN](https://dsco.atlassian.net/wiki/spaces/DSCO/pages/362217473/Connect+to+VPN)
* Go to [Portal Catalog Service Bamboo Dashboard](http://bamboo.ops:8085/browse/DCST-PC)
* To manually run a build, click `Run` in the top right corner.
* To promote a deployment to an environment, use the deploy icon in the top right corner.

#### Publish Library

Build it as in Building above, although to make it faster you can run `npm run build:lib`.

Then cd build/lib and run `npm publish` or if it's an alpha build run `npm publish --tag alpha`.

