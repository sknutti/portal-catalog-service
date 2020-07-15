/**
 * This is data that is saved on the spreadsheet itself.  It is used to pass information between the app-scripts and the apis.
 */
export interface AppScriptSaveData {
    /**
     * @see DscoColumn.saveName
     */
    colSaveNames: string[];
    modifiedRows: RowIdx[];
}

export type RowIdx = number;

export type AppScriptSaveDataKey = 'dsco_spreadsheet_save_data';
export type UserDataSheetId = 0;
export const APP_SCRIPT_SAVE_DATA_KEY: AppScriptSaveDataKey = 'dsco_spreadsheet_save_data';
export const APP_SCRIPT_VERSION = '1.0';
