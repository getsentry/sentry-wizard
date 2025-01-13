/* eslint-disable jest/expect-expect */
import { Integration } from "../../lib/Constants";
import { checkFileContents, checkFileDoesNotContain, checkFileExists, checkIfBuilds, checkIfRunsOnDevMode, checkIfRunsOnProdMode, checkPackageJson, cleanupGit, KEYS, modifyFile, revertLocalChanges, startWizardInstance } from "../utils";
import * as path from 'path';
import { TEST_ARGS } from "../utils";

async function runWizardOnAngularProject(projectDir: string, integration: Integration, fileModificationFn?: (projectDir: string) => unknown) {
  const wizardInstance = startWizardInstance(integration, projectDir);
  let packageManagerPrompted = false;

  if (fileModificationFn) {
    fileModificationFn(projectDir);

    await wizardInstance.waitForOutput(
      'Do you want to continue anyway?',
    );

    packageManagerPrompted = await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Please select your package manager.',
    );
  } else {
    packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );
  }

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
      'Added a sentry:sourcemaps script to your package.json.',
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

  const prettierPrompted = ciCdPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'Looks like you have Prettier in your project. Do you want to run it on your files?',
    ));

  prettierPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Sentry has been successfully configured for your Angular project',
    ));

  wizardInstance.kill();
};

function checkAngularProject(projectDir: string, integration: Integration, options?: {
  preExistingErrorHandler?: boolean;
}) {
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
      `import * as Sentry from '@sentry/angular'`,
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

    // Checking if the ErrorHandler is already present in the providers array,
    // and if it is, we skip adding it
    if (options?.preExistingErrorHandler) {
      checkFileDoesNotContain(appModuleFile, 'Sentry.createErrorHandler()');
    }

    checkFileContents(appModuleFile, [
      `import * as Sentry from '@sentry/angular'`,
      options?.preExistingErrorHandler ?
        `provide: ErrorHandler,
      useValue: null`
        : `provide: ErrorHandler,
      useValue: Sentry.createErrorHandler()`,
      `provide: Sentry.TraceService,
      deps: [Router]`,
      `provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [Sentry.TraceService],
      multi: true`,
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

  describe('with pre-defined ErrorHandler', () => {
    const integration = Integration.angular;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/angular-17-test-app',
    );

    beforeAll(async () => {
      await runWizardOnAngularProject(projectDir, integration, (projectDir) => {
        modifyFile(
          `${projectDir}/src/app/app.config.ts`,
          {
            'providers: [': `providers: [{
            provide: ErrorHandler,
            useValue: null
            },
            `,
          }
        );
      });
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkAngularProject(projectDir, integration, {
      preExistingErrorHandler: true,
    });
  });
});
