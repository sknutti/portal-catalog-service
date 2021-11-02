import { XlsxSpreadsheet } from '@lib/spreadsheet';
import { promises as fs } from 'fs';
import { join } from 'path';
import { testPhysicalSpreadsheet } from './utils';

test('Can extract DscoCatalogRow from Xlsx File', async () => {
    const xlsxFile = XlsxSpreadsheet.fromBuffer(await fs.readFile(join(__dirname, 'sample-xlsx.xlsx')));
    expect(xlsxFile).toBeTruthy();

    await testPhysicalSpreadsheet(xlsxFile!);
});

test('Can detect xlsx file', async () => {
    const excel_file = await fs.readFile(join(__dirname, 'sample-xlsx.xlsx'));
    expect(XlsxSpreadsheet.isXlsx(excel_file)).toEqual(true);
    expect(XlsxSpreadsheet.isXlsx(new Buffer('sku,product_status', 'utf8'))).toEqual(false);
});
