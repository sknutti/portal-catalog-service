module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    ignorePatterns: [
        'node_modules', 'build', '.idea'
    ],
    env: {
        node: true
    },
    plugins: [
        '@typescript-eslint',
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        semi: 'error',
        '@typescript-eslint/prefer-optional-chain': 'error',
        quotes: ['error', 'single', {avoidEscape: true}],
        'prefer-template': ['error'],
        'quote-props': ['error', 'as-needed'],
        'no-case-declarations': 'off',
        '@typescript-eslint/no-explicit-any': 'off'
    },
};
