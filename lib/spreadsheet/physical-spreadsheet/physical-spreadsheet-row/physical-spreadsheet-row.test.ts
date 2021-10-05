import { CatalogImage, PipelineErrorType } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { CellValue, DscoColumn, DscoSpreadsheet, PhysicalSpreadsheetRow } from '@lib/spreadsheet';

/**
 * Mimicks an actual spreadsheet row by allowing you to provide hardcoded cell values
 */
class TestPhysicalSpreadsheetRow extends PhysicalSpreadsheetRow {
    /**
     * @param cellValues - A map from the column name to the cell value in that column
     */
    constructor(private cellValues: Record<string, CellValue>) {
        super();
    }

    protected *getCellValues(dscoSpreadsheet: DscoSpreadsheet): IterableIterator<[CellValue, DscoColumn]> {
        for (const [colName, cellValue] of Object.entries(this.cellValues)) {
            const col = dscoSpreadsheet.columnsByName[colName];

            if (col) {
                yield [cellValue, col];
            }
        }
    }
}

const [retailerId, supplierId] = [1000, 2000];

test('Images are merged with existing images, keeping only name and source_url', async () => {
    const dscoSpreadsheet = new DscoSpreadsheet('test', retailerId);
    dscoSpreadsheet.addColumn(new DscoColumn('sku', undefined, 'core'));
    dscoSpreadsheet.addColumn(
        new DscoColumn('images.icon', undefined, 'core', {
            required: PipelineErrorType.error,
            format: 'image',
        }),
    );
    dscoSpreadsheet.addColumn(
        new DscoColumn('images.banner', undefined, 'core', {
            required: PipelineErrorType.warn,
            format: 'image',
        }),
    );

    const row = new TestPhysicalSpreadsheetRow({
        sku: 'TESTSKU',
        'images.icon': 'http://www.image.com/icon.png',
        'images.banner': 'http://www.image.com/banner-new.png',
    });

    const parsed = row.parseCatalogRow(dscoSpreadsheet, supplierId, retailerId, 'Shoes', [], {
        TESTSKU: {
            sku: 'TESTSKU',
            images: [
                {
                    name: 'thumbnail',
                    source_url: 'http://www.image.com/thumbnail.png',
                    hash: 'XYZ',
                    type: 'png',
                },
                {
                    name: 'banner',
                    source_url: 'http://www.image.com/banner.png',
                    hash: 'ABC',
                },
            ],
        } as CoreCatalog,
    });

    // First check the images were merged correctly
    expect(parsed.catalog.images).toEqual<CatalogImage[]>([
        {
            name: 'thumbnail',
            source_url: 'http://www.image.com/thumbnail.png',
        },
        {
            name: 'banner',
            source_url: 'http://www.image.com/banner-new.png',
        },
        {
            name: 'icon',
            source_url: 'http://www.image.com/icon.png',
        },
    ]);

    // Then check the metadata was stripped out (the gearman call doesn't like this metadata being there)
    expect(parsed.catalog.images![0].hash).toBeUndefined();
    expect(parsed.catalog.images![0].type).toBeUndefined();
    expect(parsed.catalog.images![1].hash).toBeUndefined();
});
