import SheetsOnEdit = GoogleAppsScript.Events.SheetsOnEdit;
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import SheetsOnOpen = GoogleAppsScript.Events.SheetsOnOpen;
import SpreadsheetRange = GoogleAppsScript.Spreadsheet.Range;
/**
 * This is a google app script file that will be attached to every spreadsheet.
 */

/**
 * Called every time a cell is edited in the spreadsheet
 */
function onEdit({source, range}: SheetsOnEdit): void {
    resetRangeValidationAndFormatting(source, range);
}

/**
 * This function resets a range's validation and formatting (presumably after a copy/paste) using the immutable validation copy
 * @see fillValidationForSpreadsheet
 */
function resetRangeValidationAndFormatting(spreadsheet: Spreadsheet, editedRange: SpreadsheetRange): void {
    const [userSheet, validationSheet] = spreadsheet.getSheets();

    const validationRange = validationSheet.getRange('1:1');

    const editedWidth = editedRange.getWidth();
    const editedHeight = editedRange.getHeight();
    const editColOffset = editedRange.getColumn();
    let editRowOffset = editedRange.getRow();

    // If they edited the first row
    if (editRowOffset === 1) {
        editRowOffset = 2; // ignore the first row
        if (editedHeight === 1) {
            return;
        }
    }

    for (let i = 0; i < editedWidth; i++) {
        const editedCol = userSheet.getRange(editRowOffset, editColOffset + i, editedHeight);
        editedCol.clearFormat(); // TODO: Does this clear number & date formats as well?

        const validationCell = validationRange.getCell(1, i + editColOffset);
        const validation = validationCell.getDataValidation();
        if (validation) {
            editedCol.setDataValidation(validation);
        } else {
            editedCol.clearDataValidations();
        }
    }
}
