<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Contributing

We welcome suggested improvements and bug fixes to the `@sentry/*` family of
packages, in the form of pull requests on
[`GitHub`](https://github.com/getsentry/sentry-wizard). The guide below will
help you get started, but if you have further questions, please feel free to
reach out on [Discord](https://discord.gg/Ww9hbqr). To learn about some general
setup wizard development principles check out the
[SDK Development Guide](https://develop.sentry.dev/sdk/expected-features/setup-wizards/)
in the Sentry Developer Documentation.

## Setting up an Environment

1. Fork the repository
2. Clone your fork
3. Install dependencies with `yarn install`

## Building and running locally

Build the wizard with this command

```bash
yarn build
```

If you want to simply try out the wizard locally, you can use

```bash
yarn try #also takes all CLI args you'd pass to the wizard
```

### Running local builds in external projects

If you want to run the locally built wizard in an external project (for example
a test project outside of the repo), you can simply run
`ts-node path/to/sentry-wizard/bin.ts` within the project.

Alternatively you can use `yarn link`:

1. run `yarn build` in the wizard repo
2. run `yarn link` in the wizard repo
3. head to your project
4. install the actual version of the wizard
   ```bash
   npm install @sentry/wizard #or use the package manager of your choice
   ```
5. run `yarn link @sentry/wizard` to symlink to the local repo
6. run to run the local repo:
   ```bash
   npx sentry-wizard
   #or
   yarn sentry-wizard
   ```

In repos set up with `pnpm` or more complex cases, you might want to look into
[`yalc`](https://github.com/wclr/yalc) to install local versions of the wizard
package.

## Running End-to-End Tests

The Sentry Wizard includes comprehensive end-to-end tests to ensure integrations
work correctly.

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
2. Follow the existing format:
   `- type(scope): Description ([#PR-number](PR-link))`
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

If your change contains breaking changes, add an exclamation mark after the
type:

```
- ref!: Bump main Node.js version to the earliest LTS v18 ([#793](https://github.com/getsentry/sentry-wizard/pull/793))
```

### Publishing a Release

The wizard is released via our usual Craft and `getsetntry/publish` flow:

1. Make sure the changelog is in a good and complete state.
   If not, open a PR against `master` to [update it](#updating-the-changelog)
2. Determine the next version (we follow semver versioning)
3. In GitHub, go to "Actions" and start the "Release" action
4. Enter the version to be released.
   If you're publishing a normal release, no other input fields are required.
5. Start the publishing run in `getsentry/publish`   
