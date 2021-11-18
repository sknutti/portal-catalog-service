import { CatalogImage, PipelineErrorType } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { extractFieldFromCoreCatalog } from '@lib/format-conversions';
import { DscoColumn, DscoSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { CellObject, Comments, DataValidation, Style, utils, WorkSheet } from '@sheet/image';

const EXCEL_MAX_ROW = 1048575;
// const EXCEL_MAX_COLS = 16383;

export function xlsxFromDsco(spreadsheet: DscoSpreadsheet, retailerId: number): XlsxSpreadsheet {
    const workBook = utils.book_new();
    const sheet: WorkSheet = {
        '!ref': utils.encode_range({
            s: { c: 0, r: 0 },
            e: { c: spreadsheet.numColumns, r: spreadsheet.rowData.length },
        }),
        '!condfmt': [],
        '!validations': [],
    };
    const [validationSheet, validationSheetInfo] = getValidationWorksheet();

    utils.book_append_sheet(workBook, sheet, DscoSpreadsheet.USER_SHEET_NAME);
    utils.book_append_sheet(workBook, validationSheet, DscoSpreadsheet.DATA_SHEET_NAME);
    utils.book_set_sheet_visibility(workBook, DscoSpreadsheet.DATA_SHEET_NAME, 1);

    const validations = sheet['!validations']!;

    sheet['!freeze'] = 'B2';

    let highlightStart = 0;
    let curColIdx = -1;
    let cur: PipelineErrorType | 'none' = PipelineErrorType.error;

    for (const col of spreadsheet) {
        if (col.validation.required !== cur) {
            highlightBanded(highlightStart, curColIdx, cur, sheet);

            highlightStart = curColIdx + 1;
            cur = col.validation.required;
        }
        curColIdx++;

        addValidation(col, curColIdx, validations, validationSheet, validationSheetInfo);
        sheet[utils.encode_cell({ r: 0, c: curColIdx })] = createHeader(col);

        let curRowIdx = 1;
        for (const row of spreadsheet.rowData) {
            const cellData = getCellData(row.catalog, col, retailerId);

            if (cellData) {
                checkForAndAddKnownCellValidationErrors(cellData, col.fieldName, row.catalog);
                const cell = utils.encode_cell({ r: curRowIdx, c: curColIdx });
                sheet[cell] = cellData;
            }

            curRowIdx++;
        }
    }

    highlightBanded(highlightStart, curColIdx, cur, sheet);

    validationSheet['!ref'] = utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: validationSheetInfo.maxRowIdx, c: validationSheetInfo.curColIdx },
    });

    return new XlsxSpreadsheet(workBook, sheet);
}

function createHeader(col: DscoColumn): CellObject {
    let comments: Comments | undefined;

    if (col.fieldDescription) {
        comments = [
            {
                R: [
                    {
                        t: 's',
                        v: `\n${col.fieldName} (${getRequiredName(col.validation.required)})\n\n`,
                        s: {
                            sz: 14,
                            bold: true,
                        },
                    },
                    {
                        t: 's',
                        v: col.fieldDescription || '',
                        s: {
                            sz: 12,
                            bold: false,
                        },
                    },
                ],
                a: col.fieldName,
            },
        ];
        comments.hidden = true;
        comments.s = {
            fgColor: {
                rgb: getColor(
                    col.validation.required === 'none' ? PipelineErrorType.info : col.validation.required,
                    false,
                ),
            },
        };
        comments['!pos'] = { x: 0, y: 0, ...calcCommentSize(col.fieldDescription) };
    }

    return {
        t: 's',
        v: col.name,
        s: {
            bold: true,
        },
        c: comments,
    };
}

function highlightBanded(
    highlightStart: number,
    highlightEnd: number,
    cur: PipelineErrorType | 'none',
    sheet: WorkSheet,
): void {
    if (highlightEnd < highlightStart || cur === 'none') {
        return;
    }

    const condfmt = (sheet['!condfmt'] = sheet['!condfmt'] || []);

    const borderStyle: Partial<Style> = {
        left: { style: 'thin', color: { rgb: 0xcacaca } },
        right: { style: 'thin', color: { rgb: 0xcacaca } },
        // bottom: { style: 'thin', color: { rgb: 0xCACACA } },
        // top: { style: 'thin', color: { rgb: 0xCACACA } },
    };

    // First style the header
    condfmt.push({
        ref: {
            s: { r: 0, c: highlightStart },
            e: { r: 0, c: highlightEnd },
        },
        t: 'formula',
        f: 'TRUE',
        s: { bgColor: { rgb: getColor(cur, true) }, bold: true, ...borderStyle },
    });

    // utils.sheet_set_range_style(sheet, {
    //
    // }, { bgColor: {rgb: 0xFF0000}, ...borderStyle});

    // Then style the rows beneath
    condfmt.push({
        ref: {
            s: { r: 1, c: highlightStart },
            e: { r: EXCEL_MAX_ROW, c: highlightEnd },
        },
        t: 'formula',
        f: 'MOD(ROW(),2)=0',
        s: { bgColor: { rgb: getColor(cur, false) }, ...borderStyle },
    });
}

function getColor(type: PipelineErrorType, dark: boolean): number {
    switch (type) {
        case PipelineErrorType.error:
            return dark ? 0x7cbe31 : 0xe8ffdf;
        case PipelineErrorType.warn:
            return dark ? 0x67bbe7 : 0xe3f5ff;
        case PipelineErrorType.info:
            return dark ? 0xd9d9d9 : 0xf5f5f5;
    }
}

function addValidation(
    col: DscoColumn,
    curColIdx: number,
    validations: DataValidation[],
    validationSheet: WorkSheet,
    validationSheetInfo: ValidationSheetInfo,
) {
    const ref = {
        s: { c: curColIdx, r: 1 },
        e: { c: curColIdx, r: EXCEL_MAX_ROW },
    };

    switch (col.validation.format) {
        case 'boolean':
            validations.push({
                ref,
                t: 'List',
                f: `${DscoSpreadsheet.DATA_SHEET_NAME}!$A$1:$A$2`,
            });
            return;
        case 'enum':
            validationSheetInfo.curColIdx++;
            validationSheetInfo.maxRowIdx = 1000;
            const colName = utils.encode_col(validationSheetInfo.curColIdx);

            let i = 0;
            for (const enumVal of col.validation.enumVals!) {
                validationSheet[colName + (i + 1)] = {
                    t: 's',
                    v: enumVal,
                } as CellObject;

                i++;
            }

            validations.push({
                ref,
                t: 'List',
                f: `${DscoSpreadsheet.DATA_SHEET_NAME}!$${colName}$1:$${colName}$${col.validation.enumVals!.size}`,
            });

            return;
        default:
            return;
    }
}

function getCellData(catalog: CoreCatalog, col: DscoColumn, retailerId: number): CellObject | undefined {
    let data: any;

    if (col.validation.format === 'image') {
        const [arrName, imgName] = col.imageNames;
        data = catalog[arrName].find((img: CatalogImage) => img.name === imgName)?.source_url;
    } else if (col.type === 'core') {
        data = extractFieldFromCoreCatalog(col.fieldName, catalog);
    } else if (col.type === 'extended') {
        data = catalog.extended_attributes?.[retailerId]?.[col.fieldName];
    }

    if (data === null || data === undefined) {
        return undefined;
    }

    switch (col.validation.format) {
        case 'boolean':
            return { t: 's', v: data ? 'Yes' : 'No' };
        case 'array':
            return { t: 's', v: Array.isArray(data) ? data.join(',') : `${data}` };
        case 'date':
        case 'date-time':
            const d = new Date(data);
            return isNaN(d.getTime()) ? { t: 's', v: `${data}` } : { t: 'd', v: new Date(data) };
        case 'time':
        case 'email':
        case 'enum':
        case 'image':
        case 'string':
        case 'uri':
            return { t: 's', v: `${data}` };

        case 'integer':
        case 'number':
            const num = +data;
            return { t: 'n', v: isNaN(num) ? undefined : num };
        default:
            return;
    }
}

interface ValidationSheetInfo {
    maxRowIdx: number;
    curColIdx: number;
}

function calcCommentSize(text: string): { w: number; h: number } {
    let maxW = 0;
    let w = 0;
    let h = 120;
    const l = text.length;

    for (let i = 0; i < l; i++) {
        const char = text[i];

        if (char === '\n') {
            h += 20;

            if (w > maxW) {
                maxW = w;
            }

            w = 0;
        } else {
            w += 6;
        }
    }

    if (w > maxW) {
        maxW = w;
    }

    if (maxW < 200) {
        maxW = 200;
    }

    return { w: maxW, h };
}

function getRequiredName(required: PipelineErrorType | 'none'): string {
    switch (required) {
        case PipelineErrorType.error:
            return 'Required';
        case PipelineErrorType.warn:
            return 'Recommended';
        case PipelineErrorType.info:
        case 'none':
            return 'Optional';
    }
}

function getValidationWorksheet(): [WorkSheet, ValidationSheetInfo] {
    const yes: CellObject = {
        t: 's',
        v: 'Yes',
    };

    const no: CellObject = {
        t: 's',
        v: 'No',
    };

    const validationSheet: WorkSheet = {
        A1: yes,
        A2: no,
    };
    const validationSheetInfo: ValidationSheetInfo = {
        curColIdx: 0,
        maxRowIdx: 1,
    };

    return [validationSheet, validationSheetInfo];
}

/**
 * Validation errors would've been determined long before reaching this point
 * If any such errors exist, they will be specified in the given catalogData
 * This function will add the description(s) of the error to the given cell as a comment
 */
function checkForAndAddKnownCellValidationErrors(cell: CellObject, columnName: string, catalogData: CoreCatalog): void {
    // Check if there are known validation errors
    if (!catalogData.validation_errors) {
        return; // No validation errors, return without modifying
    }
    const validationErrorsForThisCell = catalogData.validation_errors.filter(
        // TODO CCR - this can fail if the column name was changed before we got here, which can happen
        // TODO CCR - Addressed by https://chb.atlassian.net/browse/CCR-113
        (error) => error.attribute_name === columnName,
    );
    if (validationErrorsForThisCell.length === 0) {
        return; // No validation errors, return without modifying
    } else if (validationErrorsForThisCell.length === 1) {
        // Add any found errors as an in-cell comment
        cell.c = [
            {
                a: 'CommerceHub',
                t: validationErrorsForThisCell[0].errors.join('\n'),
            },
        ];
        cell.c.hidden = true;
        // TODO CCR - Extremely long error messages will mean we should set:
        //cell.c['!pos'] = {w: (some width), h: (some height)} // such that the whole error message will be visible
        // TODO CCR - Addressed by https://chb.atlassian.net/browse/CCR-110
    } else {
        console.log(
            `Got ${validationErrorsForThisCell.length} mathes for the given column name, expected either 0 or 1`,
        );
        return;
    }
}
