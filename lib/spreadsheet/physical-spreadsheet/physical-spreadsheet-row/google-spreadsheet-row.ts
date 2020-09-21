import { CellValue, DscoColumn, DscoSpreadsheet } from '@lib/spreadsheet';
import { PhysicalSpreadsheetRow } from './physical-spreadsheet-row';
import { assertUnreachable, SerialDate } from '@lib/utils';
import { sheets_v4 } from 'googleapis';
import Schema$CellData = sheets_v4.Schema$CellData;

/**
 * An intermediate representation of a row in a google sheet,
 * can be parsed into a DscoCatalogRow
 *
 * @see PhysicalSpreadsheetRow.parseCatalogRow
 */
export class GoogleSpreadsheetRow extends PhysicalSpreadsheetRow {
    constructor(
      protected cellData: Schema$CellData[],
      protected isModified: boolean, // This isn't parsed from the google spreadsheet, but directly from the root GoogleSpreadsheet
      protected columnSaveNames: string[],
    ) {
        super();
    }

    protected getIsModified(): boolean {
        return this.isModified;
    }

    protected *getCellValues(dscoSpreadsheet: DscoSpreadsheet): IterableIterator<[CellValue, DscoColumn]> {
        for (let colIdx = 0; colIdx < this.cellData.length; colIdx++) {
            const cell = this.cellData[colIdx];
            const colSaveName = this.columnSaveNames[colIdx];
            const dscoCol = dscoSpreadsheet.columnsBySaveName[colSaveName];

            if (dscoCol) {
                const cellValue = this.getCellValueFromGoogleCell(cell, dscoCol);
                yield [cellValue === null ? undefined : cellValue, dscoCol];
            }
        }
    }

    /**
     * Looks at what data type the DscoColumn expects, and extracts that data from the google cell
     *
     * @returns NullableCellValue NullableCellValue is returned because that allows typescript to enforce the switch is exhaustive
     */
    protected getCellValueFromGoogleCell(cell: sheets_v4.Schema$CellData, dscoCol: DscoColumn): CellValue {
        const extendedVal = cell.effectiveValue;
        if (!extendedVal) {
            return undefined;
        }

        switch (dscoCol.validation.format) {
            case 'string':
            case 'enum':
            case 'email':
            case 'uri':
            case 'image':
            case 'array': // arrays are supposed to be comma strings as a CellValue
                return extendedVal.stringValue ?? extendedVal.numberValue?.toString() ?? extendedVal.boolValue?.toString();
            case 'number':
            case 'integer':
                return extendedVal.numberValue ?? +(extendedVal.stringValue || '0');
            case 'boolean':
                return extendedVal.boolValue ?? (extendedVal.numberValue === 1 || extendedVal.stringValue?.toLowerCase() === 'true');
            case 'date':
            case 'date-time':
                // TODO: If the user specifies the date "January 1", should we store it as UTC Jan 1 or Jan 1 in their preferred timezone?
                let date: Date | undefined;
                if (extendedVal.numberValue) {
                    date = SerialDate.toJSDate(extendedVal.numberValue);
                } else if (extendedVal.stringValue) {
                    date = new Date(extendedVal.stringValue);
                }

                return date?.getTime() ? date : undefined;
            case 'time': // TODO: Dsco doesn't really have a time format.  I've assumed 'H:mm AM|PM'
                return extendedVal.numberValue ? SerialDate.toTime(extendedVal.numberValue) : extendedVal.stringValue || undefined;
            case undefined:
                return undefined;
            default:
                assertUnreachable(dscoCol.validation.format, 'DscoColFormat', 'getCellValueFromGoogleCell');
        }
    }

}
