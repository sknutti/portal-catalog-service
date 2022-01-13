import { PipelineErrorType } from '@dsco/ts-models';
import { CoreCatalog } from '@lib/core-catalog';
import { ComplianceType, ComplianceStateEnum } from '@dsco/bus-models/dist/item';
import { CellObject } from '@sheet/image/types';
import { DscoColumn } from '../dsco-column';
import { getValidationErrorsForAColumnFromCatalogData } from './xlsx-from-dsco';

const RETAILER_ID = 1234;
const SUPPLIER_ID = 1235;
const BLANK_CELL: CellObject = { t: 'z' };

test('Validation error search can extract validation errors from a CoreCatalog object', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    dsco: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [
                            {
                                error_message: 'this is a test error we will filter for',
                                error_state: 'error',
                                attribute: 'longdescription',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'LENGTH_ERROR',
                            },
                        ],
                    },
                },
            },
        },
    };
    const testColumn = new DscoColumn('longdescription', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedResult = ['this is a test error we will filter for'];
    const testResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testColumn,
        testCatalogData,
    );
    expect(testResult).toEqual(expectedResult);
});

test('Validation error search returns empty array when compliance data is not present', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
    };
    const testColumn = new DscoColumn('longdescription', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedResult: string[] = [];
    const testResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testColumn,
        testCatalogData,
    );
    expect(testResult).toEqual(expectedResult);
});

test('Validation error search returns empty array when compliance_errors is empty', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    dsco: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [],
                    },
                },
            },
        },
    };
    const testColumn = new DscoColumn('longdescription', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedResult: string[] = [];
    const testResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testColumn,
        testCatalogData,
    );
    expect(testResult).toEqual(expectedResult);
});

test('Validation error search returns empty array when there are no matches with the given column name', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'test data only',
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    dsco: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [
                            {
                                error_message: 'this is a test error',
                                error_state: 'error',
                                attribute: 'longdescription',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'LENGTH_ERROR',
                            },
                            {
                                error_message: 'this is a test error',
                                error_state: 'error',
                                attribute: 'another_description',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'TEST_ERROR',
                            },
                            {
                                error_message: 'this is a test error',
                                error_state: 'error',
                                attribute: 'test value only',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'TEST_EXTENDED_ERROR',
                            },
                        ],
                    },
                },
            },
        },
    };
    const testColumn = new DscoColumn('this wont match anything', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedResult: string[] = [];
    const testResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testColumn,
        testCatalogData,
    );
    expect(testResult).toEqual(expectedResult);
});

test('Validation error search can distinguish between CATEGORY (core/dsco) attributes and EXTENDED_ATTRIBUTEs', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'a core/dsco attribute description',
        extendedAttributes: {
            RETAILER_ID: {
                longdescription: 'an extended attribute description',
            },
        },
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    dsco: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [
                            {
                                error_message: 'this is a test error on the core/dsco attribute',
                                error_state: 'error',
                                attribute: 'longdescription',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'TEST_ERROR',
                            },
                            {
                                error_message: 'this is a test error on the extended attribute',
                                error_state: 'error',
                                attribute: 'longdescription',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'TEST_ERROR',
                            },
                        ],
                    },
                },
            },
        },
    };

    // Testing core attribute exceptions
    const testCoreColumn = new DscoColumn('longdescription', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedCoreTestResult: string[] = ['this is a test error on the core/dsco attribute'];
    const coreTestResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testCoreColumn,
        testCatalogData,
    );
    expect(coreTestResult).toEqual(expectedCoreTestResult);

    // Testing extended attribute exceptions
    const testExtendedColumn = new DscoColumn('longdescription', 'test description only', 'extended', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedExtendedTestResult: string[] = ['this is a test error on the extended attribute'];
    const extendedTestResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testExtendedColumn,
        testCatalogData,
    );
    expect(extendedTestResult).toEqual(expectedExtendedTestResult);
});

test('Validation errors search can locate IMAGE attributes and error messages', () => {
    const errorMessage = 'error is error';
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'a core/dsco attribute description',
        extendedAttributes: {
            RETAILER_ID: {
                longdescription: 'an extended attribute description',
            },
        },
        compliance_image_map: {
            [RETAILER_ID]: {
                categories_map: {
                    'Shaun||Images1080p': {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [
                            {
                                error_details: '1000040297.testAttribute.minHeight',
                                error_message: errorMessage,
                                error_type: ComplianceType.IMAGE_COMPLIANCE,
                                error_code: 'minHeight',
                                attribute: 'testAttribute',
                            },
                        ],
                    },
                },
            },
        },
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    dsco: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [
                            {
                                error_message: 'this is a test error on the core/dsco attribute',
                                error_state: 'error',
                                attribute: 'longdescription',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'TEST_ERROR',
                            },
                            {
                                error_message: 'this is a test error on the extended attribute',
                                error_state: 'error',
                                attribute: 'longdescription',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'TEST_ERROR',
                            },
                        ],
                    },
                },
            },
        },
    };

    // Testing core attribute exceptions
    const testCoreColumn = new DscoColumn('testAttribute', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'image',
    });
    const expectedCoreTestResult = [errorMessage];
    const coreTestResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testCoreColumn,
        testCatalogData,
    );
    expect(coreTestResult).toEqual(expectedCoreTestResult);
});

test('Validation errors are reported when adjacent compliance maps are undefined (compliance_map/ compliance_image_map)', () => {
    const errorMessageImage = 'error is error';
    const errorMessageCore = 'error is about';
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'a core/dsco attribute description',
        extendedAttributes: {
            RETAILER_ID: {
                longdescription: 'an extended attribute description',
            },
        },
        compliance_image_map: {
            [RETAILER_ID]: {
                categories_map: {
                    'Shaun||Images1080p': {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [
                            {
                                error_details: '1000040297.testAttribute.minHeight',
                                error_message: errorMessageImage,
                                error_type: ComplianceType.IMAGE_COMPLIANCE,
                                error_code: 'minHeight',
                                attribute: 'testAttribute',
                            },
                        ],
                    },
                },
            },
        },
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    dsco: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2021-12-29T02:38:00.000Z'),
                        compliance_errors: [
                            {
                                error_message: errorMessageCore,
                                error_state: 'error',
                                attribute: 'longdescription',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'code',
                            },
                        ],
                    },
                },
            },
        },
    };

    // Testing core attribute exceptions

    const testImageColumn = new DscoColumn('testAttribute', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'image',
    });
    const blankComplianceMapCatalogData = { ...testCatalogData };
    blankComplianceMapCatalogData.compliance_map = undefined;
    const expectedImageTestResult = [errorMessageImage];
    const imageTestResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testImageColumn,
        blankComplianceMapCatalogData,
    );

    expect(imageTestResult).toEqual(expectedImageTestResult);

    const testCoreColumn = new DscoColumn('longdescription', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'string',
    });

    const blankComplianceImageMapCatalogData = { ...testCatalogData };
    blankComplianceImageMapCatalogData.compliance_image_map = undefined;
    const expectedCoreTestResult = [errorMessageCore];
    const coreTestResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testCoreColumn,
        blankComplianceImageMapCatalogData,
    );

    expect(coreTestResult).toEqual(expectedCoreTestResult);
});

test('Can detect multiple errors accross several ComplianceError objects for the same column', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'a core/dsco attribute description',
        extendedAttributes: {
            [RETAILER_ID]: {
                longdescription: 'an extended attribute description',
            },
        },
        compliance_image_map: {
            [RETAILER_ID]: {
                categories_map: {
                    IMAGE_COMPLIANCE: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'REQUIRED',
                                error_message: 'a',
                                error_details: null,
                            },
                        ],
                    },
                },
            },
        },
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    'Bananas||Peels': {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'REQUIRED',
                                error_message: 'b',
                                error_details: null,
                            },
                            {
                                attribute: 'red herring attribute',
                                error_state: 'error',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'REQUIRED',
                                error_message: 'red herring message',
                                error_details: null,
                            },
                        ],
                    },
                    DEFAULT: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'REQUIRED',
                                error_message: 'c',
                                error_details: null,
                            },
                        ],
                    },
                    Bananas: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.CATEGORY,
                                error_code: 'REQUIRED',
                                error_message: 'd',
                                error_details: null,
                            },
                        ],
                    },
                },
            },
        },
    };
    const testColumn = new DscoColumn('my test attribute', 'test description only', 'core', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedResult = new Set(['a', 'b', 'c', 'd']);
    const testResult = new Set(
        getValidationErrorsForAColumnFromCatalogData(RETAILER_ID, BLANK_CELL, testColumn, testCatalogData),
    );
    expect(testResult).toEqual(expectedResult);
});

test('Do not allow duplicate error messages for the same column', () => {
    const testCatalogData: CoreCatalog = {
        supplier_id: SUPPLIER_ID,
        categories: {},
        extended_attributes: {},
        toSnakeCase: undefined,
        sku: '7',
        longdescription: 'a core/dsco attribute description',
        extendedAttributes: {
            [RETAILER_ID]: {
                longdescription: 'an extended attribute description',
            },
        },
        compliance_image_map: {
            [RETAILER_ID]: {
                categories_map: {
                    IMAGE_COMPLIANCE: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'REQUIRED',
                                error_message: 'I am a duplicate',
                                error_details: null,
                            },
                        ],
                    },
                },
            },
        },
        compliance_map: {
            [RETAILER_ID]: {
                categories_map: {
                    'Bananas||Peels': {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'REQUIRED',
                                error_message: 'I am a duplicate',
                                error_details: null,
                            },
                            {
                                attribute: 'red herring attribute',
                                error_state: 'error',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'REQUIRED',
                                error_message: 'red herring message',
                                error_details: null,
                            },
                        ],
                    },
                    DEFAULT: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'REQUIRED',
                                error_message: 'I am a duplicate',
                                error_details: null,
                            },
                        ],
                    },
                    Bananas: {
                        compliance_state: ComplianceStateEnum.not_compliant,
                        compliance_date: new Date('2022-01-13T18:06:00.000Z'),
                        compliance_errors: [
                            {
                                attribute: 'my test attribute',
                                error_state: 'error',
                                error_type: ComplianceType.EXTENDED_ATTRIBUTE,
                                error_code: 'REQUIRED',
                                error_message: 'I am a duplicate',
                                error_details: null,
                            },
                        ],
                    },
                },
            },
        },
    };
    const testColumn = new DscoColumn('my test attribute', 'test description only', 'extended', {
        required: PipelineErrorType.info,
        format: 'string',
    });
    const expectedResult = ['I am a duplicate'];
    const testResult = getValidationErrorsForAColumnFromCatalogData(
        RETAILER_ID,
        BLANK_CELL,
        testColumn,
        testCatalogData,
    );
    expect(testResult).toEqual(expectedResult);
});
