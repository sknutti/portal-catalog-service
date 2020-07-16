/**
 * We store two pieces of data on the spreadsheet so that the scripts and api can interact:
 * • The column names (as a comma separated list, stored as metadata on the spreadsheet itself)
 * • Which rows have been modified (stored separately as metadata on each modified row)
 *
 * These types are shared between the two to help saving / loading the saved DeveloperMetadata
 */


export type ColumnSaveNamesSaveDataKey = 'dsco_column_names';
export const COLUMN_SAVE_NAMES_SAVE_DATA_KEY: ColumnSaveNamesSaveDataKey = 'dsco_column_names';

export type IsModifiedSaveDataKey = 'dsco_is_modified';
export const IS_MODIFIED_SAVE_DATA_KEY: IsModifiedSaveDataKey = 'dsco_is_modified';

export type UserDataSheetId = 0;
export const APP_SCRIPT_VERSION = '1.0';
