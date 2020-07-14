/**
 * This is data that is saved on the spreadsheet itself.  It is used to pass information between the app-scripts and the apis.
 */
import { DscoColumn } from '@lib/dsco-column';

export type ColIdx = number;
export type RowIdx = number;

export interface SpreadsheetSaveData {
    /**
     * @see DscoColumn.saveName
     */
    colSaveNames: string[];
    modifiedRows: Record<RowIdx, ColIdx[]>;
}

export type SpreadsheetSaveDataKey = 'dsco_spreadsheet_save_data';
export const SPREADSHEET_SAVE_DATA_KEY: SpreadsheetSaveDataKey = 'dsco_spreadsheet_save_data';
