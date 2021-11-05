import { DscoEnv } from '@dsco/ts-models';
import { getDscoEnv } from '@lib/environment';

export function getFanaticsAccountForEnv(): Account | undefined {
    return accounts[getDscoEnv()];
}

const accounts: Partial<Record<DscoEnv, Account>> = {
    // // In test we upload to "Aidan Test Supplier"
    // test: {
    //     supplierId: 1000012302,
    //     retailerId: 1000012301,
    //     userId: 26366,
    //     categoryPath: 'Catalog'
    // },
    staging: {
        supplierId: 1000007967,
        retailerId: 1000007220,
        userId: 1000011189,
        categoryPath: 'Fan Gear'
    },
    prod: {
        supplierId: 1000043924,
        retailerId: 1000003564,
        userId: 31615,
        categoryPath: 'Fan Gear'
    }
};

interface Account {
    supplierId: number;
    retailerId: number;
    userId: number;
    categoryPath: string;
}
