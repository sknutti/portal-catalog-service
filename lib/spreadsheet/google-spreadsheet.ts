import { APP_SCRIPT_SAVE_DATA_KEY, AppScriptSaveData } from '@lib/app-script';
import { DscoSpreadsheet } from '@lib/spreadsheet';
import { sheets_v4 } from 'googleapis';
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$DeveloperMetadata = sheets_v4.Schema$DeveloperMetadata;
import Schema$GridProperties = sheets_v4.Schema$GridProperties;
import Schema$RowData = sheets_v4.Schema$RowData;
import Schema$Sheet = sheets_v4.Schema$Sheet;
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;
import Sheets = sheets_v4.Sheets;

/**
 * This is a helper class that extends from google's representation of a spreadsheet.
 *
 * Has getters that help extract data from the google sheet.
 */
export class GoogleSpreadsheet implements Schema$Spreadsheet {
    sheets: [UserSheet, SheetWithData];
    developerMetadata: Schema$DeveloperMetadata[];
    spreadsheetId?: string;

    get userSheet(): UserSheet {
        return this.sheets[0];
    }

    get userSheetRowData(): Schema$RowData[] {
        return this.userSheet.data[0].rowData;
    }

    get validationSheet(): SheetWithData {
        return this.sheets[1];
    }

    get validationSheetRowData(): Schema$RowData[] {
        return this.validationSheet.data[0].rowData;
    }

    get saveDataDeveloperMetadata(): Schema$DeveloperMetadata {
        const saveDeveloperMetadata = this.developerMetadata.find(meta => meta.metadataKey === APP_SCRIPT_SAVE_DATA_KEY);

        if (!saveDeveloperMetadata) {
            throw new Error(`No save data found for sheet: ${this.spreadsheetId}`);
        }

        return saveDeveloperMetadata;
    }

    get saveData(): AppScriptSaveData {
        const meta = this.saveDataDeveloperMetadata;
        if (!meta.metadataValue) {
            throw new Error(`No save data found for sheet: ${this.spreadsheetId}`);
        }

        return JSON.parse(meta.metadataValue!) as AppScriptSaveData;
    }

    get bandedRanges(): Schema$BandedRange[] {
        return this.userSheet.bandedRanges;
    }

    get numUserCols(): number {
        return this.userSheetRowData[0]?.values?.length || 0;
    }

    get numUserRows(): number {
        return this.userSheetRowData.length;
    }

    get numValidationCols(): number {
        return this.validationSheetRowData[0]?.values?.length || 0;
    }

    get numValidationRows(): number {
        return this.validationSheetRowData.length;
    }

    constructor(sheets: [UserSheet, SheetWithData], developerMetadata: Schema$DeveloperMetadata[]) {
        this.sheets = sheets;
        this.developerMetadata = developerMetadata || [];
    }

    static async loadFromGoogle(spreadsheetId: string, sheets: Sheets): Promise<GoogleSpreadsheet> {
        const gsheet = await sheets.spreadsheets.get({
            spreadsheetId,
            // This grabs the necessary sheets & rowData, banded ranges, and developerMetadata
            fields: 'sheets(data(rowData(values(effectiveValue))),bandedRanges(bandedRangeId)),developerMetadata(metadataKey,metadataValue,metadataId)',
            includeGridData: true
        });

        if (!gsheet.data) {
            throw new Error(`Unable to load spreadsheet: ${spreadsheetId}`);
        }

        const result = new GoogleSpreadsheet(gsheet.data.sheets as [UserSheet, SheetWithData], gsheet.data.developerMetadata!);
        result.spreadsheetId = spreadsheetId;

        return result;
    }
}

interface SheetWithData extends Schema$Sheet {
    data: [{ rowData: Schema$RowData[] }];
}

interface UserSheet extends SheetWithData {
    properties: {
        gridProperties: Schema$GridProperties;
        title: typeof DscoSpreadsheet.USER_SHEET_NAME;
        sheetId: typeof DscoSpreadsheet.USER_SHEET_ID;
    },
    bandedRanges: Schema$BandedRange[];
}
