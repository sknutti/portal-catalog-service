import { DscoEnv } from '@dsco/ts-models';

export function getDscoEnv(): Exclude<DscoEnv, 'dev'> {
    const env = process.env.ENVIRONMENT;
    if (env !== 'test' && env !== 'staging' && env !== 'prod') {
        throw new Error('Environment variable ENVIRONMENT must be test, staging, or prod');
    }
    return env;
}

export function getLeoAuthUserTable(): string {
    return ensureEnvironmentVar('AUTH_USER_TABLE');
}

export function getPortalCatalogS3BucketName(): string {
    return ensureEnvironmentVar('S3_BUCKET');
}

export function getAwsRegion(): string {
    return ensureEnvironmentVar('AWS_REGION');
}

export function getFanaticsBucketName(): string {
    return ensureEnvironmentVar('FANATICS_BUCKET');
}

export function getIsRunningLocally(): boolean {
    return process.env.LEO_LOCAL === 'true';
}


function ensureEnvironmentVar(variable: string): string {
    const result = process.env[variable];
    if (!result) {
        throw new Error(`Missing environment variable ${variable}`);
    }
    return result;
}

export function setupEnvironmentForRunningLocally(env: Exclude<DscoEnv, 'dev'>): void {
    const vars = {
        test: {
            authTable: 'TestAuth-LeoAuthUser-OZ7R6RHZIPDY',
        },
        staging: {
            authTable: 'StagingAuth-LeoAuthUser-1IVNIRH40AURC'
        },
        prod: {
            authTable: 'ProdAuth-LeoAuthUser-SD8EQDNF542U'
        }
    }[env];

    process.env.AWS_REGION = 'us-east-1';
    process.env.LEO_LOCAL = 'true';
    process.env.ENVIRONMENT = env;
    process.env.LEO_ENVIRONMENT = env;
    process.env.ENVIRONMENT = env;
    process.env.LEO_ENVIRONMENT = env;
    process.env.AUTH_USER_TABLE = vars.authTable;
    process.env.GEARMAN_HOST = `gearman.${env === 'prod' ? 'local' : env}`;
    process.env.S3_BUCKET = `portal-catalog-${env}`;
}
