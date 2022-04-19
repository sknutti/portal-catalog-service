import { DscoImage, CategoriesComplianceMap, ComplianceError, ComplianceType } from '@dsco/bus-models/dist/item';
import { PipelineErrorType } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { extractFieldFromCoreCatalog } from '@lib/format-conversions';
import { DscoColumn, DscoSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { CellObject, Comments, DataValidation, Style, utils, WorkSheet } from '@sheet/image';

const EXCEL_MAX_ROW = 1048575;
const FORMATTING_MAX_ROW = 100000;
// const EXCEL_MAX_COLS = 16383;

export function xlsxFromDsco(spreadsheet: DscoSpreadsheet, retailerId: number): XlsxSpreadsheet {
    const workBook = utils.book_new();
    const sheet: WorkSheet = {
        '!ref': utils.encode_range({
            s: { c: 0, r: 0 },
            e: { c: spreadsheet.numColumns, r: FORMATTING_MAX_ROW },
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

    const cellsWithValidationErrors: string[] = [];

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
            if (cellData && col.validation.format === 'string') {
                cellData.z = '@'; // set the number as text format on any column with a string format
            }

            if (cellData) {
                const cell = utils.encode_cell({ r: curRowIdx, c: curColIdx });
                const validationErrorsForThisCell = getValidationErrorsForAColumnFromCatalogData(
                    retailerId,
                    cellData,
                    col,
                    row.catalog,
                );

                sheet[cell] = cellData;

                if (validationErrorsForThisCell.length > 0) {
                    addKnownCellValidationErrors(cellData, validationErrorsForThisCell);
                    cellsWithValidationErrors.push(cell);
                }
            }

            curRowIdx++;
        }
        // after all of the row data is added, finish creating row cells up to FORMATTING_MAX_ROW and format them to TEXT.
        if (col.validation.format === 'string') {
            const cellData = { t: 's', v: '', z: '@' } as CellObject;
            for (let row = curRowIdx; row <= FORMATTING_MAX_ROW; row++) {
                sheet[utils.encode_cell({r: row, c: curColIdx})] = cellData;
            }
        }
    }

    highlightBanded(highlightStart, curColIdx, cur, sheet);

    validationSheet['!ref'] = utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: validationSheetInfo.maxRowIdx, c: validationSheetInfo.curColIdx },
    });

    highlightSelectCellsByConditionalFormatting(sheet, cellsWithValidationErrors, 0x000000, 0xfbff7e);
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
                        v: `\n${col.name} (${getRequiredName(col.validation.required)})\n\n`,
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
                a: col.name,
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

export function getCellData(catalog: CoreCatalog, col: DscoColumn, retailerId: number): CellObject | undefined {
    let data: any;

    if (col.validation.format === 'image') {
        const [arrName, imgName] = col.imageNames;
        data = catalog[arrName].find((img: DscoImage) => img.name === imgName)?.source_url;
    } else {
        data = extractFieldFromCoreCatalog(col.fieldXPath, catalog, retailerId, col.type);
    }

    if (data === null || data === undefined) {
        return { t: 'z' };
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
 * This function will add the description(s) of the error to the given cell as a comment
 * @param cell - cell object to add comment to
 * @param validationError - validation error to communicate to customer
 */
function addKnownCellValidationErrors(cell: CellObject, validationError: string[]): void {
    cell.c = [
        {
            a: 'CommerceHub',
            t: validationError.join('\n'),
        },
    ];
    cell.c.hidden = true;
    cell.c['!pos'] = { x: 0, y: 0, ...calcCommentSize(validationError.join('\n')) };
}

/**
 * Given a catalog item and a column name, extract all validation errors from the item data for the given column
 * Return the results as an array of strings, where each element in the array is an error code
 * error messages have variable sustituions made for escape phrase $\{value\}
 * @param retailerId -
 * @param cell - excel like cell object used for text value
 * @param column - excel like column used to match column field name to filter compliance errors
 * @param catalogData -
 * @returns - an array of error messages with any duplicate messages removed
 */
export function getValidationErrorsForAColumnFromCatalogData(
    retailerId: number,
    cell: CellObject,
    column: DscoColumn,
    catalogData: CoreCatalog,
): string[] {
    let allComplianceErrors: ComplianceError[] = [];
    ['compliance_image_map', 'compliance_map'].forEach((k) => {
        if (catalogData[k]?.[retailerId]) {
            allComplianceErrors = allComplianceErrors.concat(
                getComplianceErrorsFromCategoriesMap(catalogData[k][retailerId]),
            );
        }
    });

    return removeDuplicateMessages(
        allComplianceErrors
            .filter((e) => {
                return (
                    e.attribute === column.fieldXPath &&
                    (column.type === 'extended') === (e.error_type === ComplianceType.EXTENDED_ATTRIBUTE) // XNOR
                );
            })
            .map((field_error) => {
                return (
                    field_error.error_message?.replace('${value}', `"${cell.v}"`) ||
                    `Could not interpret message - DUMPING OBJECT: ${JSON.stringify(field_error)}`
                );
            }),
    );
}

function getComplianceErrorsFromCategoriesMap(retailerCategoriesMap: CategoriesComplianceMap): ComplianceError[] {
    return Object.keys(retailerCategoriesMap.categories_map)
        .map((k) => retailerCategoriesMap.categories_map[k].compliance_errors)
        .reduce((acc, val) => acc.concat(val), []);
}

function removeDuplicateMessages(messages: string[]): string[] {
    return [...new Set(messages)];
}

/**
 * function adds to conditional formatting as a way of highlighting a list of select cells of interest
 * Note that conditional formatting takes priorty over cell styling so this must be used if conditional formatting is used for other stylings
 * @param sheet - sheetJS object that will be modified
 * @param cellAddresses - This relys on the array of celladdresses being built in the scope above this funciton
 * @param fontColorHex - hexadecimal value for rgb font color value
 * @param cellFillColorHex - hexadecimal value for rgb cell fill color value
 */
function highlightSelectCellsByConditionalFormatting(
    sheet: WorkSheet,
    cellAddresses: string[],
    fontColorHex: number,
    cellFillColorHex: number,
): void {
    const conditionalFormattingRules = (sheet['!condfmt'] = sheet['!condfmt'] || []);

    const borderStyle: Partial<Style> = {
        //this matched border style in highlightBanding fn
        left: { style: 'thin', color: { rgb: 0xcacaca } },
        right: { style: 'thin', color: { rgb: 0xcacaca } },
    };

    conditionalFormattingRules.unshift({
        ref: cellAddresses.join(' '),
        t: 'formula',
        f: 'TRUE',
        s: { bgColor: { rgb: cellFillColorHex }, color: { rgb: fontColorHex }, ...borderStyle },
    });
}
