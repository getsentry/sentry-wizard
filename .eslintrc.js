const jestPackageJson = require('jest/package.json');

module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
  ignorePatterns: [
    '.eslintrc.js',
    'build/**',
    'dist/**',
    'esm/**',
    'assets/**',
    'scripts/**',
    'coverage/**',
    'lib/Helper/test-fixtures/**',
    'e2e-tests/test-applications/**',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  overrides: [
    {
      files: [
        '**/e2e-tests/utils/**/*.ts',
        '*.test.js',
        '*.test.ts',
        '**/__tests__/**/*.ts',
        '**/__tests__/**/*.js',
      ],
      plugins: ['jest'],
      extends: ['plugin:jest/recommended', 'plugin:jest/style'],
      env: {
        'jest/globals': true,
      },
      rules: {
        'jest/expect-expect': [
          'error',
          {
            assertFunctionNames: [
              'expect',
              'checkPackageJson',
              'checkFileContents',
              'checkSentryProperties',
              'checkIfFlutterBuilds',
              'checkEnvBuildPlugin',
              'checkFileExists',
              'checkIfRunsOnDevMode',
              'checkIfRunsOnProdMode',
              'checkIfBuilds',
            ],
            additionalTestBlockFunctions: [],
          },
        ],
      },
    },
  ],
  settings: {
    jest: {
      version: jestPackageJson.version,
    },
  },
  globals: {
    NodeJS: true,
  },
  rules: {
    'no-console': 'error',
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/restrict-template-expressions': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-argument': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/no-var-requires': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    'no-undef': 'error', // https://github.com/typescript-eslint/typescript-eslint/issues/4580#issuecomment-1047144015
  },
};
