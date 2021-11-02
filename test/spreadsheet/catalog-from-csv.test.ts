import { XlsxSpreadsheet } from '@lib/spreadsheet';
import { CsvSpreadsheet } from '@lib/spreadsheet/physical-spreadsheet/csv-spreadsheet';
import { promises as fs } from 'fs';
import { join } from 'path';
import { testPhysicalSpreadsheet } from './utils';

test('Can extract DscoCatalogRow from CSV File', async () => {
    const csvFile = new CsvSpreadsheet(await fs.readFile(join(__dirname, 'sample-csv.csv')));
    expect(csvFile).toBeTruthy();

    await testPhysicalSpreadsheet(csvFile!);
});

test('Not detected as xlsx file', async () => {
    const csv_file = await fs.readFile(join(__dirname, 'sample-csv.csv'));
    expect(XlsxSpreadsheet.isXlsx(csv_file)).toEqual(false);
});
