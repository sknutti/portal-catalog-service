import { DscoEnv } from '@dsco/ts-models';

export const TEST_ACCOUNTS: Record<string, TestAccount> = {
    'Aidan Test Supplier - (Food)': {
        test: {
            defaultCategoryPath: 'Food',
            supplierId: 1000012302,
            userId: 26366,
            retailerId: 1000012301,
        },
    },
    'E2E-Supplier - (Shaun||Images1080p)': {
        test: {
            defaultCategoryPath: 'Shaun||Images1080p',
            supplierId: 1000040296,
            userId: 54352,
            retailerId: 1000040297,
        },
    },
    'E2E-Supplier - (Bananas||Peels)': {
        test: {
            defaultCategoryPath: 'Bananas||Peels',
            supplierId: 1000040296,
            userId: 54352,
            retailerId: 1000040297,
        },
    },
    'E2E-Supplier - (Clothes||Shirts)': {
        test: {
            defaultCategoryPath: 'Clothes||Shirts',
            supplierId: 1000040296,
            userId: 54352,
            retailerId: 1000040297,
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
};

export type TestAccount = Partial<Record<Exclude<DscoEnv, 'dev'>, TestAccountInfo>>;

interface TestAccountInfo {
    isRealCustomer?: boolean;
    userId: number;
    retailerId: number;
    supplierId: number;
    defaultCategoryPath?: string;
}
