/**
 * This is data that is saved on the spreadsheet itself.  It is used to pass information between the app-scripts and the apis.
 */

export type ColIdx = number;
export type RowIdx = number;

export interface SpreadsheetSaveData {
    colData: SpreadsheetColSaveData[];
    modifiedRows: Record<RowIdx, ColIdx[]>;
}

export interface SpreadsheetColSaveData {
    name: string;
    // Only supplied if the field name isn't the same as the name
    fieldName?: string;
    type: 'core' | 'extended' | 'transient'
}

export type SpreadsheetSaveDataKey = 'dsco_spreadsheet_save_data';
export const SPREADSHEET_SAVE_DATA_KEY: SpreadsheetSaveDataKey = 'dsco_spreadsheet_save_data';
