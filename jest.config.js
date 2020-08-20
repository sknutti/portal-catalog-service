process.env.JEST_FILE = 'coverage/jest.json';

module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	collectCoverageFrom: [
		'api/**/*.ts',
		'bot/**/*.ts',
		'lib/**/*.ts'
	],
	modulePathIgnorePatterns: [
		'<rootDir>/(build|coverage|node_modules)/'
	],
	moduleNameMapper: {
		'^@lib/(.*)$': '<rootDir>/lib/$1',
	},
	testRegex: '/(api|bot|lib)/.*.test.ts',
	// collectCoverage: true,
	testResultsProcessor: 'jest-bamboo-formatter'
};
