# Contributing to Sentry Wizard

Thank you for your interest in contributing to Sentry Wizard! This document will guide you through the process.

## Development Environment

1. Fork the repository
2. Clone your fork
3. Install dependencies with `yarn install`

## Running End-to-End Tests

The Sentry Wizard includes comprehensive end-to-end tests to ensure integrations work correctly.

### Running All Tests

To run all end-to-end tests:

```bash
yarn test:e2e
```

### Running Specific Tests

To test a specific framework integration:

```bash
yarn test:e2e [Flutter | Remix | NextJS | SvelteKit]
```

## Updating the Changelog

For every meaningful change, please add an entry to the `CHANGELOG.md` file:

1. Add your entry under the `## Unreleased` section
2. Follow the existing format: `- type(scope): Description ([#PR-number](PR-link))`
3. Choose the appropriate type:
   - `feat`: A new feature
   - `fix`: A bug fix
   - `ref`: Code refactoring that neither fixes a bug nor adds a feature
   - `chore`: Changes to the build process or auxiliary tools
   - `docs`: Documentation only changes
4. Include the scope (framework/area affected) in parentheses
5. Provide a concise description of your change
6. Add the PR number and link when available (or add it later)

Example:
```
- feat(nextjs): Add connectivity check to example page with helpful error UI ([#123](https://github.com/getsentry/sentry-wizard/pull/123))
```

If your change contains breaking changes, add an exclamation mark after the type:
```
- ref!: Bump main Node.js version to the earliest LTS v18 ([#793](https://github.com/getsentry/sentry-wizard/pull/793))
```
