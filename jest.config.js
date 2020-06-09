process.env.JEST_FILE = 'coverage/jest.json';

module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	collectCoverageFrom: [
		'api/**/*.ts',
	],
	testRegex: '/api/.*.test.ts',
	collectCoverage: true,
	testResultsProcessor: 'jest-bamboo-formatter'
};
