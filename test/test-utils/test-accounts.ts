import { DscoEnv } from '@dsco/ts-models';

export const TEST_ACCOUNTS: Record<string, TestAccount> = {
    'Aidan Test Supplier': {
        test: {
            supplierId: 1000012302,
            userId: 26366,
            retailerId: 1000012301
        }
    },
    Fanatics: {
        staging: {
            isRealCustomer: true,
            supplierId: 1000007967,
            retailerId: 1000007220,
            userId: 1000011189,
            defaultCategoryPath: 'Fan Gear'
        },
        prod: {
            isRealCustomer: true,
            supplierId: 1000043924,
            retailerId: 1000003564,
            userId: 31615,
            defaultCategoryPath: 'Fan Gear'
        }
    }
};

export type TestAccount = Partial<Record<Exclude<DscoEnv, 'dev'>, TestAccountInfo>>;

interface TestAccountInfo {
    isRealCustomer?: boolean;
    userId: number;
    retailerId: number;
    supplierId: number;
    defaultCategoryPath?: string;
}
