# End-to-end Tests for Sentry Wizard

## Structure

```
test-applications/
|---- flutter-test-app/
|---- nextjs-14-test-app/
|---- nextjs-15test-app/
|---- nuxt-3-test-app/
|---- nuxt-4-test-app/
|---- react-native-test-app/
|---- react-native-expo-test-app/
|---- remix-test-app/
|---- sveltekit-test-app/
tests/
|---- flutter.test.ts
|---- nextjs.14.test.ts
|---- nextjs.15.test.ts
|---- nuxt.3.test.ts
|---- nuxt.4.test.ts
|---- react-native.test.ts
|---- react-native-expo.test.ts
|---- remix.test.ts
|---- sveltekit.test.ts
```

### Utilities

`utils/` contains helpers such as the wizard runner, assertion tools and file
modifiers that can be used in (`*.test.ts`).

#### Helpers

- `startWizardInstance` - Starts a new instance of `WizardTestEnv`.

- `initGit` - Initializes a temporary git repository in the test project.
- `cleanupGit` - Cleans up the temporary git repository in the test project.
- `revertLocalChanges` - Reverts local changes (git tracked or untracked) in the
  test project.

- `createFile` - Creates a file (optionally with content) in the test project.
- `modifyFile` - Modifies a file in the test project.

- `checkFileExists` - Checks if a file exists in the test project.
- `checkPackageJson` - Checks if the `@sentry/[integration]` package exists in
  the dependencies of the test project's `package.json`.
- `checkSentryCliConfig` - Checks if the `.sentryclirc` file contains the Sentry
  auth token.
- `checkEnvBuildPlugin` - Cheks if `.env.sentry-build-plugin` contains the
  Sentry auth token.

- `checkIfBuilds` - Checks if the test project builds successfully.
- `checkIfRunsOnDevMode` - Checks if the test project runs on dev mode
  successfully.
- `checkIfRunsOnProdMode` - Checks if the test project runs on prod mode
  successfully.

- `checkIfFlutterBuilds` - Checks if the Flutter (Web) test project builds
  successfully.
- `checkSentryProperties` - Checks if the Flutter `sentry.properties` file
  contains the auth token

#### `WizardTestEnv`

`WizardTestEnv` is a class that can be used to run the Sentry Wizard in a test
environment. It provides methods to run the wizard with specific arguments and
stdio.

## Running Tests Locally

First, you need to create a `.env` file set the environment variables from the
`.env.example` file in the root of the project.

Tests can be run locally from the root of the project with:

`yarn test:e2e`

To run a specific test application

`yarn test:e2e [Flutter | Remix | NextJS | SvelteKit]`

## Writing Tests

Each test file should contain a single test suite that tests the Sentry Wizard
for a specific framework. The test suite should contain a `beforeAll` and
`afterAll` function that starts and stops the test application respectively.
