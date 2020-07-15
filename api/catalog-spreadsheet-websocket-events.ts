import { ValidationMessage, XrayActionSeverity } from '@dsco/ts-models';

export interface SpreadsheetRowMessage extends Partial<ValidationMessage> {
    message: string;
    messageType: XrayActionSeverity;
}

export interface CatalogSpreadsheetWebsocketEvents {
    generateCatalogSpreadsheetProgress: {
        categoryPath: string;
        progress: number; // float; 0 to 1
        message: string;
    };
    generateCatalogSpreadsheetSuccess: {
        categoryPath: string;
        url: string;
        outOfDate: boolean; // True if there have been changes outside of the spreadsheet
    };
    publishCatalogSpreadsheetProgress: {
        categoryPath: string;
        progress: number; // float; 0 to 1
        message: string;
    };
    publishCatalogSpreadsheetSuccess: {
        categoryPath: string;
        rowMessages: { [row: number]: SpreadsheetRowMessage[] };
    };
    publishCatalogSpreadsheetFail: {
        reason: 'out-of-date' | 'no-spreadsheet-found';
    };
    updateCatalogSpreadsheetProgress: {
        categoryPath: string;
        progress: number; // float; 0 to 1
        message: string;
    };
    updateCatalogSpreadsheetSuccess: {
        categoryPath: string;
    };
}

