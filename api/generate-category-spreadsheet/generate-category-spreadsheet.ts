import { apiWrapper, getUser, SecretsManagerHelper } from '@dsco/service-utils';
import {
    AttributeDataType,
    AttributeRequiredType,
    AttributionCategoryAttribute,
    MissingRequiredFieldError,
    UnauthorizedError
} from '@dsco/ts-models';
import { google, sheets_v4 } from 'googleapis';
import { GenerateCategorySpreadsheetRequest } from './generate-category-spreadsheet.request';
import Schema$CellData = sheets_v4.Schema$CellData;
import Schema$Color = sheets_v4.Schema$Color;
import Schema$RowData = sheets_v4.Schema$RowData;
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;

interface GoogleSecret {
    accessToken: string;
    refreshToken: string;
    scopes: string;
    clientSecret: string;
    clientId: string;
}

const secretHelper = new SecretsManagerHelper<GoogleSecret>('catalog-editor-google-api', 60_000);

export const generateCategorySpreadsheet = apiWrapper<GenerateCategorySpreadsheetRequest>(async event => {
    if (!event.body.attributes || !Array.isArray(event.body.attributes)) {
        return new MissingRequiredFieldError('attributes');
    }

    const user = await getUser(event.requestContext, process.env.AUTH_USER_TABLE!);

    // Must be logged in
    if (!user?.accountId) {
        return new UnauthorizedError();
    }

    const {accessToken, refreshToken, clientId, clientSecret} = await secretHelper.getValue();

    // The google api may automatically refresh the accessToken.  If that's the case, this promise will be set to save the token back in the secrets helper.
    let updateAccessTokenPromise: Promise<GoogleSecret> | undefined;

    const oauthClient = new google.auth.OAuth2(clientId, clientSecret);
    oauthClient.setCredentials({access_token: accessToken, refresh_token: refreshToken});
    oauthClient.on('tokens', tokens => {
        if (tokens.access_token && tokens.access_token !== accessToken) {
            console.log('Generated new access token');
            updateAccessTokenPromise = secretHelper.setValue({
                accessToken: tokens.access_token
            });
        }
    });

    const attributes = event.body.attributes as AttributionCategoryAttribute[];


    const sheets = google.sheets({version: 'v4', auth: oauthClient});
    const drive = google.drive({version: 'v3', auth: oauthClient});

    // Use this to get a sheet by id:
    // const sheetId = '1aUKuWTx2FSpKpiSxfTGCpNhjhcdcJU1Yya9a72N_L-s';
    // const sheet = await sheets.spreadsheets.get({
    //     spreadsheetId: sheetId,
    //     // includeGridData: true
    // });

    const sheet = generateSpreadsheet(attributes, 'Generated Spreadsheet');
    const response = await sheets.spreadsheets.create({
        requestBody: sheet
    });
    const fileId = response.data.spreadsheetId!;

    // For some annoying reason banding has to be done after the fact.
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: fileId,
        requestBody: {
            includeSpreadsheetInResponse: false,
            responseIncludeGridData: false,
            requests: [
                {
                    addBanding: {
                        bandedRange: sheet.sheets![0].bandedRanges![0]
                    }
                },
                {
                    addBanding: {
                        bandedRange: sheet.sheets![0].bandedRanges![1]
                    }
                },
                {
                    addBanding: {
                        bandedRange: sheet.sheets![0].bandedRanges![2]
                    }
                }
            ]
        }
    });

    await drive.permissions.create({
        fileId,
        requestBody: {
            role: 'writer',
            type: 'anyone'
        }
    });

    // If the accessToken was updated, wait for completion
    if (updateAccessTokenPromise) {
        console.log('Saving generated access token');
        await updateAccessTokenPromise;
    }

    return {
        success: true,
        url: `https://docs.google.com/spreadsheets/d/${fileId}/edit?rm=minimal`,
        // sheet
    };
});


function generateSpreadsheet(attributes: AttributionCategoryAttribute[], title: string): Schema$Spreadsheet {
    const headerRow: Schema$CellData[] = [];
    const dataRow: Schema$CellData[] = [];

    const counts: Record<AttributeRequiredType, number> = {
        [AttributeRequiredType.required]: 0,
        [AttributeRequiredType.recommended]: 0,
        [AttributeRequiredType.optional]: 0
    };

    for (const attr of attributes) {
        counts[attr.requiredType]++;

        headerRow.push({
            userEnteredValue: {stringValue: attr.name},
            userEnteredFormat: {
                textFormat: {
                    fontFamily: 'Arial',
                    bold: true
                }
            }
        });
        if (attr.dataType === AttributeDataType.integer) {
            dataRow.push({
                userEnteredFormat: {numberFormat: {pattern: '#,##0', type: 'NUMBER'}}
                // dataValidation: {
                //     inputMessage: `${attr.name}: Numbers Only (No Decimal)`
                // }
            });
        } else if (attr.dataType === AttributeDataType.float) {
            dataRow.push({
                userEnteredFormat: {numberFormat: {type: 'NUMBER'}}
                // dataValidation: {
                //     inputMessage: `${attr.name}: Numbers Only (Decimal Allowed)`
                // }
            });
        } else if (attr.dataType === AttributeDataType.enum) {
            dataRow.push({
                dataValidation: {
                    condition: {
                        type: 'ONE_OF_LIST',
                        values: attr.possibleValues?.map(attr => {
                            return {
                                userEnteredValue: `${attr}`
                            };
                        }) ?? []
                    },
                    inputMessage: `${attr.name}: Click and enter a value from the list of items`,
                    strict: true,
                    showCustomUi: true
                }
            });
        } else if (attr.dataType === AttributeDataType.string) {
            dataRow.push({
                effectiveFormat: {
                    numberFormat: {
                        type: 'TEXT'
                    }
                }
                // dataValidation: {
                //     inputMessage: `${attr.name}: Text Input`
                // }
            });
        } else if (attr.dataType === AttributeDataType.boolean) {
            dataRow.push({
                dataValidation: {
                    condition: {type: 'BOOLEAN'},
                    showCustomUi: true,
                    strict: true,
                    inputMessage: `${attr.name}: TRUE/FALSE`
                }
            });
        } else {
            dataRow.push({});
        }
    }

    console.log(counts);

    const rowData: Schema$RowData[] = [{values: headerRow}];

    for (let i = 0; i < 99; i++) {
        rowData.push({values: dataRow});
    }

    return {
        sheets: [
            {
                data: [{rowData}],
                properties: {
                    gridProperties: {
                        rowCount: 100,
                        // frozenRowCount: 1
                    },
                    sheetId: 0
                },
                protectedRanges: [
                    {
                        description: 'Headers',
                        range: {
                            startColumnIndex: 0,
                            endColumnIndex: headerRow.length,
                            startRowIndex: 0,
                            endRowIndex: 1,
                            sheetId: 0
                        },
                        editors: {
                            users: ['dsco.catalog.editor@dsco.io']
                        }
                    }
                ],
                bandedRanges: [
                    {
                        range: {
                            sheetId: 0,
                            startColumnIndex: 0,
                            endColumnIndex: counts.required,
                            startRowIndex: 0,
                        },
                        rowProperties: {
                            headerColor: getColorForRequired(AttributeRequiredType.required),
                            firstBandColor: {red: 1, green: 1, blue: 1},
                            secondBandColor: getColorForRequired(AttributeRequiredType.required, true),
                        }
                    },
                    {
                        range: {
                            sheetId: 0,
                            startColumnIndex: counts.required,
                            endColumnIndex: counts.required + counts.recommended,
                            startRowIndex: 0,
                        },
                        rowProperties: {
                            headerColor: getColorForRequired(AttributeRequiredType.recommended),
                            firstBandColor: {red: 1, green: 1, blue: 1},
                            secondBandColor: getColorForRequired(AttributeRequiredType.recommended, true),
                        }
                    },
                    {
                        range: {
                            sheetId: 0,
                            startColumnIndex: counts.required + counts.recommended,
                            endColumnIndex: counts.required + counts.recommended + counts.optional,
                            startRowIndex: 0,
                        },
                        rowProperties: {
                            headerColor: getColorForRequired(AttributeRequiredType.optional),
                            firstBandColor: {red: 1, green: 1, blue: 1},
                            secondBandColor: getColorForRequired(AttributeRequiredType.optional, true),
                        }
                    }
                ]
            }
        ],
        properties: {
            title
        }
    };
}

function getColorForRequired(status: AttributeRequiredType, light = false): Schema$Color {
    switch (status) {
        case AttributeRequiredType.required:
            return {
                red: light ? 0.9281132075 : 0.5529412,
                green: light ? 1 : 0.7764706,
                blue: light ? 0.9013207547 : 0.24705882
            };
        case AttributeRequiredType.recommended:
            return {
                red: light ? 0.9130188679 : 0.47058824,
                green: light ? 0.9696226415 : 0.78039217,
                blue: light ? 1 : 0.9254902
            };
        case AttributeRequiredType.optional:
            return {
                red: light ? 0.97 : 0.8784314,
                green: light ? 0.97 : 0.8784314,
                blue: light ? 0.97 : 0.8784314
            };
    }
}
