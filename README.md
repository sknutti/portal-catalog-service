# Portal Catalog Service

## Notes On Auth
This service uses an oauth refresh token to programmatically access `dsco.catalog.editor@dsco.io` 
using the Google Sheets and Google Drive apis.

If this refresh token expires (changed password, inactive for 6 months), follow the instructions here
to obtain a new one: https://stackoverflow.com/questions/19766912/how-do-i-authorise-an-app-web-or-installed-without-user-intervention

Then update the refresh token in AWS secrets manager: https://console.aws.amazon.com/secretsmanager/home?region=us-east-1#/secret?name=catalog-editor-google-api
