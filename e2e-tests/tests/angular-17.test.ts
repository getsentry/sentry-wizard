/* eslint-disable jest/expect-expect */
import { Integration } from "../../lib/Constants";
import { checkFileContents, checkFileExists, checkIfBuilds, checkIfRunsOnDevMode, checkIfRunsOnProdMode, checkPackageJson, cleanupGit, KEYS, revertLocalChanges, startWizardInstance } from "../utils";
import * as path from 'path';
import { TEST_ARGS } from "../utils";

async function runWizardOnAngularProject(projectDir: string, integration: Integration) {
  const wizardInstance = startWizardInstance(integration, projectDir);
  const packageManagerPrompted = await wizardInstance.waitForOutput(
    'Please select your package manager.',
  );

  const tracingOptionPrompted =
    packageManagerPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      // Selecting `yarn` as the package manager
      [KEYS.DOWN, KEYS.ENTER],
      // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
      'to track the performance of your application?',
      {
        timeout: 240_000,
        optional: true,
      },
    ));

  const replayOptionPrompted =
    tracingOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      // "Do you want to enable Sentry Session Replay", sometimes doesn't work as `Sentry Session Replay` can be printed in bold.
      'to get a video-like reproduction of errors during a user session?',
    ));

  const sourcemapsPrompted = replayOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      // The first choice here is Angular
      [KEYS.ENTER],
      'Where are your build artifacts located?',
    ));


  const sourcemapsConfigured = sourcemapsPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      ["./dist", KEYS.ENTER],
      'Verify that your build tool is generating source maps.',
    ), {
      optional: true,
    });

  const buildScriptPrompted = sourcemapsConfigured &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Do you want to automatically run the sentry:sourcemaps script after each production build?',
    ));

  const defaultBuildCommandPrompted = buildScriptPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Is yarn build your production build command?',
    ));

  const ciCdPrompted = defaultBuildCommandPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Are you using a CI/CD tool to build and deploy your application?',
    ));

  ciCdPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'Sentry has been successfully configured for your Angular project',
    ));

  wizardInstance.kill();
};

function checkAngularProject(projectDir: string, integration: Integration) {
  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, integration);

    const packageJsonFile = path.resolve(projectDir, 'package.json');
    checkFileContents(packageJsonFile, [
      `"sentry:sourcemaps": "sentry-cli sourcemaps inject --org ${TEST_ARGS.ORG_SLUG} --project ${TEST_ARGS.PROJECT_SLUG} ./dist && sentry-cli sourcemaps upload --org ${TEST_ARGS.ORG_SLUG} --project ${TEST_ARGS.PROJECT_SLUG} ./dist"`,
      `"build": "ng build && yarn sentry:sourcemaps"`,
    ]);
  })

  test('Sentry is correctly injected into Angular app config', () => {
    const appConfigFile = path.resolve(projectDir, 'src/main.ts');
    checkFileExists(appConfigFile);

    checkFileContents(appConfigFile, [
      `import * as Sentry from "@sentry/angular"`,
      'Sentry.init({',
      TEST_ARGS.PROJECT_DSN,
      'Sentry.browserTracingIntegration()',
      'Sentry.replayIntegration()',
      'tracesSampleRate: 1',
      'replaysSessionSampleRate: 0.1',
      'replaysOnErrorSampleRate: 1',
    ]);
  });

  test('Sentry is correctly injected into Angular app module', () => {
    const appModuleFile = path.resolve(projectDir, 'src/app/app.config.ts');
    checkFileExists(appModuleFile);

    checkFileContents(appModuleFile, [
      `import * as Sentry from "@sentry/angular"`,
      `{
    provide: ErrorHandler,
    useValue: Sentry.createErrorHandler()
  }`,
      `{
    provide: Sentry.TraceService,
    deps: [Router]
  }`,
      `{
    provide: APP_INITIALIZER,
    useFactory: () => () => {},
    deps: [Sentry.TraceService],
    multi: true
  }`,
    ]);
  });

  test('angular.json is updated correctly', () => {
    const angularJsonFile = path.resolve(projectDir, 'angular.json');
    checkFileExists(angularJsonFile);

    const angularJson = require(angularJsonFile);

    for (const [, project] of Object.entries(angularJson.projects) as any) {
      expect(project?.architect?.build?.configurations?.production?.sourceMap).toBe(true);
    }
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir, 'Application bundle generation complete.');
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Application bundle generation complete.');
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'Application bundle generation complete.');
  });
};

describe('Angular-17', () => {
  describe('with empty project', () => {
    const integration = Integration.angular;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/angular-17-test-app',
    );

    beforeAll(async () => {
      await runWizardOnAngularProject(projectDir, integration);
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkAngularProject(projectDir, integration);
  });
});
