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

- `createIsolatedTestEnv` - creates a new isolated test env by copying the test app to a temporary directory. 
   Also initializes git in the tmp dir

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

## Running Tests Locally

First, you need to create a `.env` file set the environment variables from the
`.env.example` file in the root of the project.

Tests can be run locally from the root of the project with:

`yarn test:e2e`

To run a specific test application

`yarn test:e2e [Flutter | Remix | NextJS | SvelteKit]`

## Writing Tests

Each test file should test the Sentry Wizard for a specific framework and project. 

The test suite may contain multiple wizard runs but for consistency, each scenario must be
isolated via `createIsolatedTestEnv`. You can most easily do this by using a `describe` block 
per wizard run. 

For every `describe` block, isolate the test, run the wizard in `beforeAll`, `test` what you 
want to test and clean up the tmp dir in `afterAll`:

```ts
describe('no sentry files present', () => {
  const {projectDir, cleanup} = createIsolatedTestEnv();
  
  beforeAll(() => {
    await runWizard(projectDir);
  });

  afterAll(() => {
    cleanup()
  })
})

describe('with sentry files present', () => {
  const {projectDir, cleanup} = createIsolatedTestEnv();
  
  beforeAll(() => {
    addSentryFiles(projectDir);
    await runWizard(projectDir);
  });

  afterAll(() => {
    cleanup()
  })
})
```

### Running the wizard

To define how a wizard run should look like (i.e. which responses the "user" makes) on
wizard prompots, use `clifty`. Clifty's `run` method starts a new process to run the wizard 
with the predefined interaction and returns the processe's exit code. 
You can use this to check for a successful wizard run.

```ts
import { KEYS, withEnv } from 'clifty';

const wizardExitCode = await withEnv({
  cwd: projectDir,
})
  .defineInteraction()
  .whenAsked('Do you want to enable Tracing')
  .respondWith(KEYS.ENTER)
  .expectOutput('Added Sentry code to sentry.client.ts')
  .run(getWizardCommand(Integrations.nextjs));

// ...

test('wizard ran successfully', () => {
  expect(wizardExitCode).toBe(0);
})
```

