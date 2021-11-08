process.env.JEST_FILE = 'coverage/jest.json';
require('ts-node/register');
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('lib/environment').setupEnvironmentForRunningLocally('test');

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
    forceExit: true,
};
