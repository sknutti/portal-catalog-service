import { CatalogImage, PipelineErrorType } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { DscoColumn, DscoSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { CellObject, DataValidation, Style, utils, WorkSheet } from '@sheet/image';

const EXCEL_MAX_ROW = 1048575;
// const EXCEL_MAX_COLS = 16383;

export function xlsxFromDsco(spreadsheet: DscoSpreadsheet, retailerId: number): XlsxSpreadsheet {
    const workBook = utils.book_new();
    const sheet: WorkSheet = {
        '!ref': utils.encode_range({s: {c: 0, r: 0}, e: {c: spreadsheet.numColumns, r: spreadsheet.rowData.length}}),
        '!condfmt': [],
        '!validations': []
    };
    const validationSheet: WorkSheet = {};
    const validationSheetInfo: ValidationSheetInfo = {curColIdx: -1, maxRowIdx: -1};

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
        sheet[utils.encode_cell({r: 0, c: curColIdx})] = createHeader(col);

        let curRowIdx = 1;
        for (const row of spreadsheet.rowData) {
            const cellData = getCellData(row.catalog, col, retailerId);

            if (cellData) {
                const cell = utils.encode_cell({r: curRowIdx, c: curColIdx});
                sheet[cell] = cellData;
            }

            curRowIdx++;
        }
    }

    highlightBanded(highlightStart, curColIdx, cur, sheet);

    validationSheet['!ref'] = utils.encode_range({s: {r: 0, c: 0}, e: {r: validationSheetInfo.maxRowIdx, c: validationSheetInfo.curColIdx}});

    return new XlsxSpreadsheet(workBook, sheet);
}

function createHeader(col: DscoColumn): CellObject {
    return {
        t: 's',
        v: col.name,
        s: {
            bold: true
        }
    };
}

function highlightBanded(highlightStart: number, highlightEnd: number, cur: PipelineErrorType | 'none', sheet: WorkSheet): void {
    if (highlightEnd < highlightStart || cur === 'none') {
        return;
    }

    const condfmt = sheet['!condfmt'] = sheet['!condfmt'] || [];

    const borderStyle: Partial<Style> = {
        left: { style: 'thin', color: { rgb: 0xCACACA } },
        right: { style: 'thin', color: { rgb: 0xCACACA } },
        // bottom: { style: 'thin', color: { rgb: 0xCACACA } },
        // top: { style: 'thin', color: { rgb: 0xCACACA } },
    };

    // First style the header
    condfmt.push({
        ref: {
            s: {r: 0, c: highlightStart},
            e: {r: 0, c: highlightEnd}
        },
        t: 'formula',
        f: 'TRUE',
        s: { bgColor: { rgb: getColor(cur, true) }, bold: true, ...borderStyle }
    });

    // utils.sheet_set_range_style(sheet, {
    //
    // }, { bgColor: {rgb: 0xFF0000}, ...borderStyle});

    // Then style the rows beneath
    condfmt.push({
        ref: {
            s: {r: 1, c: highlightStart},
            e: {r: EXCEL_MAX_ROW, c: highlightEnd}
        },
        t: 'formula',
        f: 'MOD(ROW(),2)=0',
        s: { bgColor: { rgb: getColor(cur, false) }, ...borderStyle }
    });
}

function getColor(type: PipelineErrorType, dark: boolean): number {
    switch (type) {
        case PipelineErrorType.error:
            return dark ? 0x7CBE31 : 0xE8FFDF;
        case PipelineErrorType.warn:
            return dark ? 0x67BBE7 : 0xE3F5FF;
        case PipelineErrorType.info:
            return dark ? 0xD9D9D9 : 0xF5F5F5;
    }
}

function addValidation(col: DscoColumn, curColIdx: number, validations: DataValidation[], validationSheet: WorkSheet, validationSheetInfo: ValidationSheetInfo) {
    const ref = {s: {c: curColIdx, r: 1}, e: {c: curColIdx, r: EXCEL_MAX_ROW}};

    switch (col.validation.format) {
        case 'boolean':
            validations.push({
                ref,
                t: 'Custom',
                // input: {
                //     title: 'Aidan Rocks',
                //     message: 'This must be a boolean'
                // },
                f: 'OR(INDIRECT("RC", FALSE)=TRUE, INDIRECT("RC", FALSE)=FALSE)'
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
                    v: enumVal
                } as CellObject;

                i++;
            }

            validations.push({
                ref,
                t: 'List',
                f: `${DscoSpreadsheet.DATA_SHEET_NAME}!$${colName}$1:$${colName}$${col.validation.enumVals!.size}`
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
        data = catalog[col.fieldName];
    } else if (col.type === 'extended') {
        data = catalog.extended_attributes?.[retailerId]?.[col.fieldName];
    }

    if (data === null || data === undefined) {
        return undefined;
    }

    switch (col.validation.format) {
        case 'boolean':
            return {t: 'b', v: !!data};
        case 'array':
            return {t: 's', v: Array.isArray(data) ? data.join(',') : `${data}` };
        case 'date':
        case 'date-time':
            const d = new Date(data);
            return isNaN(d.getTime()) ? {t: 's', v: `${data}`} : {t: 'd', v: new Date(data)};
        case 'time':
        case 'email':
        case 'enum':
        case 'image':
        case 'string':
        case 'uri':
            return {t: 's', v: `${data}`};

        case 'integer':
        case 'number':
            const num = +data;
            return {t: 'n', v: isNaN(num) ? undefined : num};
    }
}


interface ValidationSheetInfo {
    maxRowIdx: number;
    curColIdx: number;
}
