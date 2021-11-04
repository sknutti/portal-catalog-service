process.env.JEST_FILE = 'coverage/jest.json';
process.env.ENVIRONMENT = 'test';
process.env.LEO_ENVIRONMENT = 'test';
process.env.LEO_LOCAL = 'true';
process.env.AWS_REGION = 'us-east-1';
process.env.ENVIRONMENT = 'test';
process.env.LEO_ENVIRONMENT = 'test';
process.env.AUTH_USER_TABLE = 'TestAuth-LeoAuthUser-OZ7R6RHZIPDY';
process.env.GEARMAN_HOST = 'gearman.local';
process.env.S3_BUCKET = 'portal-catalog-test';

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverageFrom: ['api/**/*.ts', 'bot/**/*.ts', 'lib/**/*.ts'],
    modulePathIgnorePatterns: ['<rootDir>/(build|coverage|node_modules)/'],
    moduleNameMapper: {
        '^@lib/(.*)$': '<rootDir>/lib/$1',
        '^@api/(.*)$': '<rootDir>/api/$1',
        '^@bot/(.*)$': '<rootDir>/bot/$1',
    },
    testRegex: '/(api|bot|lib|test)/.*.test.ts',
    // collectCoverage: true,
    testResultsProcessor: 'jest-bamboo-formatter',
    // TODO: Why is this needed? Running jest with --detectOpenHandles does nothing, just hangs
    forceExit: true
};
