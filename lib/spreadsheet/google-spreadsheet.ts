import { COLUMN_SAVE_NAMES_SAVE_DATA_KEY, IS_MODIFIED_SAVE_DATA_KEY } from '@lib/app-script';
import { DscoSpreadsheet } from '@lib/spreadsheet';
import { stringList } from 'aws-sdk/clients/datapipeline';
import { sheets_v4 } from 'googleapis';
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$DeveloperMetadata = sheets_v4.Schema$DeveloperMetadata;
import Schema$DimensionProperties = sheets_v4.Schema$DimensionProperties;
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
    properties: {
        title?: string;
    };

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

    get columnSaveNamesDeveloperMetadata(): Schema$DeveloperMetadata {
        const saveDeveloperMetadata = this.developerMetadata.find(meta => meta.metadataKey === COLUMN_SAVE_NAMES_SAVE_DATA_KEY);

        if (!saveDeveloperMetadata) {
            throw new Error(`No save name data found for sheet: ${this.spreadsheetId}`);
        }

        return saveDeveloperMetadata;
    }

    get columnSaveNames(): string[] {
        const meta = this.columnSaveNamesDeveloperMetadata;
        if (!meta.metadataValue) {
            throw new Error(`No column save names metadata found for sheet: ${this.spreadsheetId}`);
        }

        return meta.metadataValue.split(',');
    }

    get modifiedRowIndexes(): Set<number> {
        const result = new Set<number>();

        for (const {rowIdx} of this.getModifiedRowDeveloperMetadata()) {
            result.add(rowIdx);
        }

        return result;
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

    constructor(sheets: [UserSheet, SheetWithData], developerMetadata: Schema$DeveloperMetadata[], title?: string) {
        this.sheets = sheets;
        this.developerMetadata = developerMetadata || [];
        this.properties = {
            title
        };
    }

    setRowModifiedMetadata(idx: number, modified: boolean): void {
        const rowMetadata = this.userSheet.data[0].rowMetadata;
        let data = rowMetadata[idx];
        if (!data) {
            data = rowMetadata[idx] = {};
        }

        if (modified) {
            data.developerMetadata = [{
                metadataKey: IS_MODIFIED_SAVE_DATA_KEY,
                metadataValue: 'true',
                visibility: 'DOCUMENT',
                location: {
                    dimensionRange: {
                        dimension: 'ROWS',
                        sheetId: DscoSpreadsheet.USER_SHEET_ID,
                        startIndex: idx,
                        endIndex: idx + 1
                    }
                }
            }];
        }
    }

    * getModifiedRowDeveloperMetadata(): Generator<{ developerMetadata: Schema$DeveloperMetadata, rowIdx: number }> {
        let rowIdx = 0;
        for (const rowMeta of this.userSheet.data[0].rowMetadata) {
            for (const developerMetadata of rowMeta?.developerMetadata || []) {
                if (developerMetadata.metadataKey === IS_MODIFIED_SAVE_DATA_KEY) {
                    yield {developerMetadata, rowIdx};
                }
            }
            rowIdx++;
        }
    }

    static async loadFromGoogle(spreadsheetId: string, sheets: Sheets): Promise<GoogleSpreadsheet> {
        const developerMetadataFields = 'developerMetadata(metadataKey,metadataValue,metadataId)';
        const gsheet = await sheets.spreadsheets.get({
            spreadsheetId,
            // This grabs the necessary sheets & rowData, banded ranges, and developerMetadata
            fields: `sheets(data(rowData(values(effectiveValue)),rowMetadata(${developerMetadataFields})),bandedRanges(bandedRangeId)),${developerMetadataFields}`,
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
    data: [
        {
            rowData: Schema$RowData[],
            rowMetadata: Schema$DimensionProperties[]
        }
    ];
    properties: {
        gridProperties: Schema$GridProperties;
        title: typeof DscoSpreadsheet.USER_SHEET_NAME;
        sheetId: typeof DscoSpreadsheet.USER_SHEET_ID;
    },
    bandedRanges: Schema$BandedRange[];
}
