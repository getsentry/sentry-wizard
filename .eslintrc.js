module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: [
    'build/**',
    'dist/**',
    'esm/**',
    'assets/**',
    'scripts/**',
    'coverage/**',
  ],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    {
      files: ['lib/Helper/__tests__/**'],
      rules: {
        'spaced-comment': 'off',
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
