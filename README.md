# Portal Catalog Service

Contains a set of catalog-related apis designed to be called directly from the portal.

## Usage

Each api exports a request object that can be used to invoke the api.

Example web use:

```typescript
import {signedFetch} from '@dsco/aws-auth';
import {GenerateCategorySpreadsheetRequest} from '@dsco/portal-catalog-service';

const request = new GenerateCategorySpreadsheetRequest(...);
const response = await signedFetch(request, DSCO_ENV, DSCO_CONFIG.AWS_REGION, DSCO_CONFIG.AWS_COGNITO_ID, window.AWS);
```

## Installing the @sheets/image package

The @sheets/image package requires you to be logged in to a private npm registry.

```
npm login --scope=@sheet --registry=https://pylon.sheetjs.com:54111/
```

Use these credentials:

Username: `dscoio`

Password: `kL6RdzbKMKtUBu4C`

Email Address: `me@sheetjs.com`

The module includes:

-   documentation at `node_modules/@sheet/image/README.html`
-   standalone browser scripts at `node_modules/@sheet/image/dist/`
-   NPM and bundler-friendly code at `node_modules/@sheet/image/`

Updates are distributed through NPM. To download the latest version, run `npm install @sheet/image@*`

## Project Layout

The source for each of the apis lambdas can be found in `/api/function_name/`
The source for each of the bot lambdas can be found in `/bot/function_name/`

Shared code and helper code can be found under `/lib`

## Running Locally

_Note: Running locally requires you are connected to the dsco vpn_

There's two methods of running locally:

-   A manual test script that allows you to quickly test most operations
-   Use serverless-offline to run a local http server allowing you to invoke lambdas

#### Manual Test Script

This is the easiest method to get started. Simply run `npm run manual-test`. For more info, view the README in the scripts directory

#### Serverless-Offline Server

To start, run `npm start` which will watch for changes to your apis and
start a server so you can test them under [localhost:3000](localhost:3000)

To set which environment you're running against, head on over to `webpack.config.ts` and change the `stage` variable at the top of the file.
You'll need to restart the server anytime you change this value.

To invoke a lambda as a specific user, you'll need to provide a
`cognito-identity-i` header value on your requests. To get an identity value for a specific account and
user:

1. Go to Dsco internal tools
2. Log in as the account that you want into the Dsco portal
3. Open up a javascript console in the browser
4. Type this in and hit enter: `AWS.config.credentials.identityId`
5. You will now see the identity ID of the logged in user in that account

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
_Note: This repo has been updated to utilize bitbucket pipelines. It is no longer necessary to deploy using Bamboo._

Bamboo builds run automatically when changes are pushed to the master branch. New builds will be automatically deployed to test.

-   [Connect to VPN](https://dsco.atlassian.net/wiki/spaces/DSCO/pages/362217473/Connect+to+VPN)
-   Go to [Portal Catalog Service Bamboo Dashboard](http://bamboo.ops:8085/browse/DCST-PCS)
-   To manually run a build, click `Run` in the top right corner.
-   To promote a deployment to an environment, use the deploy icon in the top right corner.

#### Publish Library

Build it as in Building above, although to make it faster you can run `npm run build:lib`.

Then cd build/lib and run `npm publish` or if it's an alpha build run `npm publish --tag alpha`.

#### Typedoc Document

-   Run `npm run doc`
-   Goto `/docs/index.html` in your browser
