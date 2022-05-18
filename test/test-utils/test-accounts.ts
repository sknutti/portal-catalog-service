import { DscoEnv } from '@dsco/ts-models';

export const TEST_ACCOUNTS: Record<string, TestAccount> = {
    'Aidan Test Supplier': {
        test: {
            defaultCategoryPath: 'Food',
            supplierId: 1000012302,
            userId: 26366,
            retailerId: 1000012301,
        },
    },
    'E2E-Supplier': {
        test: {
            supplierId: 1000040296,
            userId: 54352,
            retailerId: 1000040297,
        },
        staging: {
            supplierId: 1000007983,
            retailerId: 1000007985,
            userId: 1000011261,
        },
    },
    'CatalogAttributionDevs': {
        test: {
            isRealCustomer: true,
            supplierId: 1000040469,
            userId: 26384,
            retailerId: 1000040468,
        },
    },
    Fanatics: {
        staging: {
            isRealCustomer: true,
            supplierId: 1000007967,
            retailerId: 1000007220,
            userId: 1000011189,
            defaultCategoryPath: 'Fan Gear',
        },
        prod: {
            isRealCustomer: true,
            supplierId: 1000043924,
            retailerId: 1000003564,
            userId: 31615,
            defaultCategoryPath: 'Fan Gear',
        },
    },
    'Demo Retailer 3': {
        prod: {
            retailerId: 1000010787,
            supplierId: 1000010792,
            userId: 18419,
        },
    },
    'KNS x Belk': {
        prod: {
            isRealCustomer: true,
            supplierId: 1000044156,
            retailerId: 1000043588,
            userId: 17844,
        },
    },
    'brandX x Safah International Inc.': {
        prod: {
            isRealCustomer: true,
            supplierId: 1000046359,
            retailerId: 1000045955,
            userId: 10581,
        },
    },
    'Bass Pro x Gamin Test': {
        staging: {
            isRealCustomer: true,
            supplierId: 1000007633,
            retailerId: 1000007591,
            userId: 1000010190,
        },
    },
};

export type TestAccount = Partial<Record<Exclude<DscoEnv, 'dev'>, TestAccountInfo>>;

interface TestAccountInfo {
    isRealCustomer?: boolean;
    userId: number;
    retailerId: number;
    supplierId: number;
    defaultCategoryPath?: string;
}
