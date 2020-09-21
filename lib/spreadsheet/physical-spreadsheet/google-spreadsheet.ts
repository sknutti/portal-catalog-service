import { COLUMN_SAVE_NAMES_SAVE_DATA_KEY, IS_MODIFIED_SAVE_DATA_KEY } from '@lib/app-script';
import { DscoSpreadsheet } from '@lib/spreadsheet';
import { drive_v3, sheets_v4 } from 'googleapis';
import { PhysicalSpreadsheet } from './physical-spreadsheet';
import { GoogleSpreadsheetRow } from './physical-spreadsheet-row';
import Drive = drive_v3.Drive;
import Schema$BandedRange = sheets_v4.Schema$BandedRange;
import Schema$DeveloperMetadata = sheets_v4.Schema$DeveloperMetadata;
import Schema$DimensionProperties = sheets_v4.Schema$DimensionProperties;
import Schema$GridProperties = sheets_v4.Schema$GridProperties;
import Schema$RowData = sheets_v4.Schema$RowData;
import Schema$Sheet = sheets_v4.Schema$Sheet;
import Schema$Spreadsheet = sheets_v4.Schema$Spreadsheet;
import Schema$UpdateDimensionPropertiesRequest = sheets_v4.Schema$UpdateDimensionPropertiesRequest;
import Sheets = sheets_v4.Sheets;

/**
 * This is a helper class that extends from google's representation of a spreadsheet.
 *
 * Has helpers for getting/setting data, sending to google, and migrating between different sheets
 */
export class GoogleSpreadsheet extends PhysicalSpreadsheet implements Schema$Spreadsheet {
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

    get numDataRows(): number {
        return this.numUserRows - 1; // minus 1 for header
    }

    get numValidationCols(): number {
        return this.validationSheetRowData[0]?.values?.length || 0;
    }

    get numValidationRows(): number {
        return this.validationSheetRowData.length;
    }

    constructor(sheets: [UserSheet, SheetWithData], developerMetadata: Schema$DeveloperMetadata[], title?: string) {
        super();

        this.sheets = sheets;
        this.developerMetadata = developerMetadata || [];
        this.properties = {
            title
        };
    }

    *rows(): IterableIterator<GoogleSpreadsheetRow> {
        for (let rowIdx = 1; rowIdx < this.userSheetRowData.length; rowIdx++) { // Start at 1 to skip the header row
            const row = this.userSheetRowData[rowIdx]?.values || [];

            yield new GoogleSpreadsheetRow(row, this.modifiedRowIndexes.has(rowIdx), this.columnSaveNames);
        }
    }

    setRowModifiedMetadata(idx: number, modified: boolean): void {
        const rowMetadata = this.userSheet.data[0].rowMetadata;
        let data = rowMetadata[idx];
        if (!data) {
            data = rowMetadata[idx] = {};
        }

        if (modified) {
            data.developerMetadata = [GoogleSpreadsheet.createIsModifiedDeveloperMetadata(idx)];
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

    /**
     * Saves this google spreadsheet to google drive
     *
     * @returns the generated file id
     */
    async sendToGoogle(sheets: Sheets, drive: Drive, dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[]): Promise<string> {
        const response = await sheets.spreadsheets.create({
            requestBody: this
        });

        const fileId = response.data.spreadsheetId!;

        const bandedRanges = this.bandedRanges;

        // For some annoying reason banding and dimensions need to be done after the fact.
        if (bandedRanges.length || dimensionUpdates.length) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: fileId,
                requestBody: {
                    includeSpreadsheetInResponse: false,
                    responseIncludeGridData: false,
                    requests: [
                        ...bandedRanges.map(bandedRange => ({addBanding: {bandedRange}})),
                        ...dimensionUpdates.map(dimension => ({updateDimensionProperties: dimension}))
                    ]
                }
            });
        }

        // Makes the spreadsheet public
        await drive.permissions.create({
            fileId,
            requestBody: {
                role: 'writer',
                type: 'anyone'
            }
        });

        return fileId;
    }

    /**
     * Migrates this google spreadsheet to the new google spreadsheet, replacing all rows, banding, validation data, etc.
     *
     * Does not handle migrating the app script for the sheet!
     */
    async migrateInPlace(newSheet: GoogleSpreadsheet, dimensionUpdates: Schema$UpdateDimensionPropertiesRequest[], sheets: Sheets): Promise<void> {
        const existingDeveloperMetadata: {developerMetadata: Schema$DeveloperMetadata}[] = [
            {developerMetadata: this.columnSaveNamesDeveloperMetadata},
            ...this.getModifiedRowDeveloperMetadata(),
        ];

        const newDeveloperMetadata: {developerMetadata: Schema$DeveloperMetadata}[] = [
            {developerMetadata: newSheet.columnSaveNamesDeveloperMetadata},
            ...newSheet.getModifiedRowDeveloperMetadata(),
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
                requests: [
                    // Append rows / cols to either sheet if needed. (google will throw an error without this)
                    ...[
                        {appendDimension: {sheetId: DscoSpreadsheet.USER_SHEET_ID, dimension: 'COLUMNS', length: newSheet.numUserCols - this.numUserCols}},
                        {appendDimension: {sheetId: DscoSpreadsheet.USER_SHEET_ID, dimension: 'ROWS', length: newSheet.numUserRows - this.numUserRows}},
                        {appendDimension: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, dimension: 'COLUMNS', length: newSheet.numValidationCols - this.numValidationCols}},
                        {appendDimension: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, dimension: 'ROWS', length: newSheet.numValidationRows - this.numValidationRows}},
                    ].filter(req => req.appendDimension.length > 0),
                    // Remove all existing banded ranges
                    ...this.bandedRanges.map(({bandedRangeId}) => ({deleteBanding: {bandedRangeId}})),
                    // Remove all developer metadata
                    ...existingDeveloperMetadata.map(({developerMetadata}) => ({
                        deleteDeveloperMetadata: {dataFilter: {developerMetadataLookup: {metadataId: developerMetadata.metadataId}}}
                    })),
                    // Update the cells for the user sheet
                    {
                        updateCells: {
                            range: {sheetId: DscoSpreadsheet.USER_SHEET_ID, startColumnIndex: 0, startRowIndex: 0},
                            fields: '*',
                            rows: newSheet.userSheetRowData
                        }
                    },
                    // Same for the validation sheet
                    {
                        updateCells: {
                            range: {sheetId: DscoSpreadsheet.DATA_SHEET_ID, startColumnIndex: 0, startRowIndex: 0},
                            fields: '*',
                            rows: newSheet.validationSheetRowData
                        }
                    },
                    // Add the new developer metadata
                    ...newDeveloperMetadata.map(({developerMetadata}) => ({createDeveloperMetadata: {developerMetadata}})),
                    // Add the new banded ranges
                    ...newSheet.bandedRanges.map(bandedRange => ({addBanding: {bandedRange}})),
                    // Resize the columns that need it
                    ...dimensionUpdates.map(dimension => ({updateDimensionProperties: dimension}))
                ]
            }
        });
    }

    static createIsModifiedDeveloperMetadata(rowIdx: number): Schema$DeveloperMetadata {
        return {
            metadataKey: IS_MODIFIED_SAVE_DATA_KEY,
            metadataValue: 'true',
            visibility: 'DOCUMENT',
            location: {
                dimensionRange: {
                    dimension: 'ROWS',
                    sheetId: DscoSpreadsheet.USER_SHEET_ID,
                    startIndex: rowIdx,
                    endIndex: rowIdx + 1
                }
            }
        };
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
