import { DsError, PipelineErrorType, ProductStatus } from '@dsco/ts-models';
import { createCoreCatalog } from '@lib/core-catalog';
import { GetWarehousesGearmanResponse, TinyWarehouse } from '@lib/requests';
import { DscoCatalogRow, DscoColumn, DscoSpreadsheet, XlsxSpreadsheet } from '@lib/spreadsheet';
import { promises as fs } from 'fs';
import { join } from 'path';

const firstWarehouse: TinyWarehouse = {code: '123', warehouseId: '321'};
const secondWarehouse: TinyWarehouse = {code: 'abc', warehouseId: 'cba'};

jest.mock('@lib/requests/get-warehouses.gearman-api', () => ({
    GetWarehousesGearmanApi: jest.fn().mockImplementation(() => ({
        submit(): Promise<GetWarehousesGearmanResponse | DsError> {
            return Promise.resolve({success: true, warehouses: [firstWarehouse, secondWarehouse]});
        }
    }))
}));

test('Can extract DscoCatalogRow from Xlsx File', async () => {
    const xlsxFile = XlsxSpreadsheet.fromBase64(await fs.readFile(join(__dirname, 'sample-xlsx.xlsx'), {encoding: 'base64'}));
    expect(xlsxFile).toBeTruthy();

    const supplierId = 1;
    const retailerId = 2;
    const categoryPath = 'My Cool Test||Category!';

    // To test merging existing catalog data, we will setup an existing item with warehouses and images
    const existingItems = {
        MYSKU2123: createCoreCatalog(supplierId, retailerId, categoryPath).catalog
    };
    const overriddenWarehouseQuantity = 5;
    const overriddenWarehouse = {warehouse_id: secondWarehouse.warehouseId, code: secondWarehouse.code, quantity: overriddenWarehouseQuantity};

    existingItems.MYSKU2123.product_status = ProductStatus.PENDING;
    existingItems.MYSKU2123.quantity_available = overriddenWarehouseQuantity;
    existingItems.MYSKU2123.warehouses = [overriddenWarehouse];
    existingItems.MYSKU2123.images = [
        {source_url: 'http://hi.com/img.png', name: 'hi', height: 32, width: 100},
        {source_url: 'http://old-front-image.com/old.png', name: 'Front_Image', height: 500, width: 500}
    ];

    const catalogRows = await Promise.all(xlsxFile!.extractCatalogRows(generateSampleDscoSpreadsheet(retailerId), supplierId, retailerId, categoryPath, existingItems));

    expect(catalogRows).toMatchObject([
        {
            catalog: {
                _error_for_pending_: true,
                supplier_id: supplierId,
                categories: {[retailerId]: [categoryPath]},
                extended_attributes: {[retailerId]: {Supplier_Number: 12345, Shoe_Color: 'Red'}},
                estimated_availability_date: new Date('12/03/1933'),
                sku: 'MYSKU2123',
                quantity_available: 5,
                warehouses: [overriddenWarehouse, {quantity: 0, warehouse_id: firstWarehouse.warehouseId, code: firstWarehouse.code}],
                images: [
                    {source_url: 'http://hi.com/img.png', name: 'hi', height: 32, width: 100},
                    {source_url: 'http://shoe.img/front.png', name: 'Front_Image', height: 500, width: 500}
                ],
                product_status: 'active'
            },
            modified: true,
            savedToDsco: true,
            emptyRow: false
        },
        {
            catalog: {
                _error_for_pending_: true,
                supplier_id: supplierId,
                categories: {[retailerId]: [categoryPath]},
                extended_attributes: {[retailerId]: {Supplier_Number: 12348.5, Shoe_Color: 'Blue'}},
                sku: 'MYSKU2124',
                estimated_availability_date: new Date('10/10/2010'),
                quantity_available: 0,
                warehouses: [
                    {quantity: 0, warehouse_id: firstWarehouse.warehouseId, code: firstWarehouse.code},
                    {quantity: 0, warehouse_id: secondWarehouse.warehouseId, code: secondWarehouse.code}
                ],
                product_status: 'inactive',
                images: [{name: 'Front_Image', source_url: 'http://shoe.img/back.png'}]
            },
            modified: true,
            savedToDsco: false,
            emptyRow: false
        }
    ]);
});

function generateSampleDscoSpreadsheet(retailerId: number): DscoSpreadsheet {
    const dscoSpreadsheet = new DscoSpreadsheet('mySheet', retailerId);
    dscoSpreadsheet.addColumn(new DscoColumn('sku', '', 'core', {
        format: 'string',
        required: PipelineErrorType.error
    }));
    dscoSpreadsheet.addColumn(new DscoColumn('upc', '', 'core', {
        format: 'string',
        required: 'none'
    }));

    dscoSpreadsheet.addColumn(new DscoColumn('product_status', '', 'core', {
        format: 'enum',
        enumVals: new Set(['active', 'inactive']),
        required: PipelineErrorType.error
    }));

    dscoSpreadsheet.addColumn(new DscoColumn('Supplier_Number', '', 'extended', {
        format: 'number',
        required: PipelineErrorType.error
    }));

    dscoSpreadsheet.addColumn(new DscoColumn('Shoe_Color', '', 'extended', {
        format: 'enum',
        enumVals: new Set(['Red', 'Blue']),
        required: PipelineErrorType.error
    }));

    dscoSpreadsheet.addColumn(new DscoColumn('estimated_availability_date', '', 'core', {
        format: 'date',
        required: 'none'
    }));

    dscoSpreadsheet.addColumn(new DscoColumn('images.Front_Image', '', 'extended', {
        format: 'image',
        required: PipelineErrorType.error
    }));

    return dscoSpreadsheet;
}
