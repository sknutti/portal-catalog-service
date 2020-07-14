/**
 * This is a google app script file that will be attached to every spreadsheet.
 */

import SheetsOnEdit = GoogleAppsScript.Events.SheetsOnEdit;
import DataValidation = GoogleAppsScript.Spreadsheet.DataValidation;
import Range = GoogleAppsScript.Spreadsheet.Range;
import SpreadsheetRange = GoogleAppsScript.Spreadsheet.Range;
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import Color = GoogleAppsScript.Spreadsheet.Color;
import { SpreadsheetSaveData, SpreadsheetSaveDataKey } from '@lib/spreadsheet-save-data';
import DeveloperMetadata = GoogleAppsScript.Spreadsheet.DeveloperMetadata;

// eslint-disable-next-line @typescript-eslint/no-empty-function
let log = (...values: any[]) => {};

/**
 * Called every time a cell is edited in the spreadsheet
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onEdit({source, range}: SheetsOnEdit): void {
    log = (...values) => source.getSheets()[1].appendRow(values);

    const editedRange = getEditableRange(range);

    if (editedRange) {
        resetRangeValidationAndFormatting(source, editedRange);
        markRowsAsPending(source, editedRange);
        storeModifiedRows(new SaveDataManager(source), editedRange);
    }
}

/**
 * This function resets a range's validation and formatting (presumably after a copy/paste) using the immutable validation copy
 * @see fillValidationForSpreadsheet
 */
function resetRangeValidationAndFormatting(spreadsheet: Spreadsheet, editedRange: SpreadsheetRange): void {
    const validationSheet = spreadsheet.getSheets()[1];

    const validationRange = validationSheet.getRange('1:1');
    const validationData = validationRange.getDataValidations()[0];
    const numberFormatData = validationRange.getNumberFormats()[0];

    const startColIdx = editedRange.getColumn() - 1;

    const sizes = editedRange.getFontSizes();
    const weights = editedRange.getFontWeights();
    const families = editedRange.getFontFamilies();
    const styles = editedRange.getFontStyles();
    const lines = editedRange.getFontLines();
    const colors = (editedRange as any).getFontColorObjects() as Color[][];

    const existingDataValidations = editedRange.getDataValidations();
    const updatedDataValidations: (DataValidation | null)[][] = [];

    const existingNumberFormats = editedRange.getNumberFormats();
    const updatedNumberFormats: string[][] = [];

    let shouldOverwriteValidations = false;
    let shouldClearFormatting = false;
    let shouldOverwriteNumberFormatting = false;

    const numRows = existingDataValidations.length;
    const numCells = existingDataValidations[0]?.length || 0;
    for (let rowNum = 0; rowNum < numRows; rowNum++) {
        const validationRow = existingDataValidations[rowNum];
        const numFormatRow = existingNumberFormats[rowNum];

        const updatedValidationRow: (DataValidation | null)[] = [];
        updatedDataValidations.push(updatedValidationRow);

        const updatedNumFormatRow: string[] = [];
        updatedNumberFormats.push(updatedNumFormatRow);

        for (let cellNum = 0; cellNum < numCells; cellNum++) {
            const validationRowIdx = cellNum + startColIdx;

            // Handle validation
            const correctValidation = validationData[validationRowIdx];
            updatedValidationRow.push(correctValidation);

            if (!compareValidation(validationData[validationRowIdx], validationRow[cellNum])) {
                shouldOverwriteValidations = true;
            }

            // Handle number formatting
            const correctNumFormatting = numberFormatData[validationRowIdx];
            updatedNumFormatRow.push(correctNumFormatting);

            if (numFormatRow[cellNum] !== correctNumFormatting) {
                shouldOverwriteNumberFormatting = true;
            }

            // Handle other formatting
            if (!shouldClearFormatting && !isDefaultFont(sizes[rowNum][cellNum], weights[rowNum][cellNum], families[rowNum][cellNum],
              styles[rowNum][cellNum], lines[rowNum][cellNum], colors[rowNum][cellNum])) {
                shouldClearFormatting = true;
            }
        }
    }

    if (shouldClearFormatting) {
        editedRange.clearFormat();
    }
    if (shouldOverwriteNumberFormatting) {
        editedRange.setNumberFormats(updatedNumberFormats);
    }
    if (shouldOverwriteValidations) {
        editedRange.setDataValidations(updatedDataValidations);
    }
}

function compareValidation(val1: DataValidation | null, val2: DataValidation | null): boolean {
    if (val1 === val2) {
        return true;
    }

    if (!val1 || !val2) {
        return false;
    }

    if ((val1.getCriteriaType() !== val2.getCriteriaType()) || (val1.getHelpText() !== val2.getHelpText())) {
        return false;
    }

    const criteria1 = val1.getCriteriaValues();
    const criteria2 = val2.getCriteriaValues();
    for (let i = 0; i < criteria1.length; i++) {
        const criteriaVal1 = criteria1[i];
        const criteriaVal2 = criteria2[i];

        if (criteriaVal1 !== criteriaVal2) {

            if (!criteriaVal1 || !criteriaVal1) {
                return false;
            }

            // This is used to compare ranges
            if (criteriaVal1 && criteriaVal2 && 'getDataSourceUrl' in criteriaVal1 && 'getDataSourceUrl' in criteriaVal2 &&
              (criteriaVal1.getDataSourceUrl() === criteriaVal2.getDataSourceUrl())) {
                return true;
            }

            Logger.log('Found different criteria vals: ', criteriaVal1, criteriaVal2);

            return false;
        }
    }

    return true;
}

/**
 * The header cells and the first call aren't editable.
 * This will exclude those cells from the range.
 *
 * Returns null if the entire range is not editable
 */
function getEditableRange(range: Range): Range | null {
    const numRows = range.getNumRows();
    const numCols = range.getNumColumns();

    const rowOffset = range.getRow() === 1 ? 1 : 0;
    const colOffset = range.getColumn() === 1 ? 1 : 0;

    if ((rowOffset && numRows === 1) || (colOffset && numCols === 1)) {
        return null;
    }

    return (rowOffset || colOffset) ? range.offset(rowOffset, colOffset, numRows - rowOffset, numCols - colOffset) : range;
}

function isDefaultFont(size: number, weight: string, family: string, style: string, line: string, color: Color): boolean {
    try {
        if (color.asRgbColor().asHexString() !== '#ff000000') {
            return false;
        }
    } catch (e) {
        return false;
    }

    return size === 10 && weight === 'normal' && family === 'Arial' && style === 'normal' && line === 'none';
}


function markRowsAsPending(spreadsheet: Spreadsheet, editedRange: Range): void {
    const userSheet = spreadsheet.getSheets()[0];
    userSheet.getRange(editedRange.getRow(), 1, editedRange.getHeight()).uncheck();
}

function storeModifiedRows(saveDataManager: SaveDataManager, editedRange: Range): void {
    const {modifiedRows} = saveDataManager.saveData;
    const modifiedRowsSet = new Set(modifiedRows);
    const startRowIdx = editedRange.getRow() - 1;
    const endRowIdx = startRowIdx + editedRange.getNumRows();

    for (let rowIdx = startRowIdx; rowIdx < endRowIdx; rowIdx++) {
        if (!modifiedRowsSet.has(rowIdx)) {
            modifiedRows.push(rowIdx);
        }
    }

    saveDataManager.save();
}

class SaveDataManager {
    private static key: SpreadsheetSaveDataKey = 'dsco_spreadsheet_save_data';

    public saveData: SpreadsheetSaveData;
    private dm: DeveloperMetadata;
    constructor(private sheet: Spreadsheet) {
        this.dm = sheet.getDeveloperMetadata().find(dm => dm.getKey() === SaveDataManager.key)!;
        this.saveData = JSON.parse(this.dm.getValue()!);
    }

    save(): void {
        log(JSON.stringify(this.saveData));
        this.dm.setValue(JSON.stringify(this.saveData));
    }
}
