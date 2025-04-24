import { Integration } from '../../lib/Constants';
import {
  checkFileContents,
  checkFileDoesNotContain,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  cleanupGit,
  KEYS,
  modifyFile,
  revertLocalChanges,
  startWizardInstance,
} from '../utils';
import * as path from 'path';
import { TEST_ARGS } from '../utils';
import { test, expect, describe, beforeAll, afterAll } from 'vitest';

describe.sequential('Angular-17', () => {
  describe('with empty project', () => {
    const integration = Integration.angular;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/angular-17-test-app',
    );

    beforeAll(async () => {
      revertLocalChanges(projectDir);
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
      revertLocalChanges(projectDir);
      await runWizardOnAngularProject(projectDir, integration, (projectDir) => {
        modifyFile(`${projectDir}/src/app/app.config.ts`, {
          'providers: [': `providers: [{
            provide: ErrorHandler,
            useValue: null
            },
            `,
        });
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

async function runWizardOnAngularProject(
  projectDir: string,
  integration: Integration,
  fileModificationFn?: (projectDir: string) => unknown,
) {
  const wizardInstance = startWizardInstance(integration, projectDir, true);

  if (fileModificationFn) {
    fileModificationFn(projectDir);

    await wizardInstance.waitForOutput('Do you want to continue anyway?');

    await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Please select your package manager.',
    );
  } else {
    await wizardInstance.waitForOutput('Please select your package manager.');
  }

  await wizardInstance.sendStdinAndWaitForOutput(
    // Selecting `yarn v1` as the package manager
    [KEYS.DOWN, KEYS.ENTER],
    // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
    'to track the performance of your application?',
    {
      timeout: 240_000, // installing the sdk can take a while
      optional: true,
    },
  );

  await wizardInstance.sendStdinAndWaitForOutput(
    // select "Yes" for tracing
    [KEYS.ENTER],
    // "Do you want to enable Sentry Session Replay", sometimes doesn't work as `Sentry Session Replay` can be printed in bold.
    'to get a video-like reproduction of errors during a user session?',
  );

  await wizardInstance.sendStdinAndWaitForOutput(
    // select "Yes" for replay
    [KEYS.ENTER],
    'Where are your build artifacts located?',
    {
      timeout: 240_000, // installing Sentry CLI can take a while
    },
  );

  const sourcemapsConfiguredPromise = wizardInstance.waitForOutput(
    'Added a sentry:sourcemaps script to your package.json',
  );

  const buildScriptPromptedPromise = wizardInstance.waitForOutput(
    'Do you want to automatically run the sentry:sourcemaps script after each production build?',
  );

  const optionalArtifactsNotFoundPromise = wizardInstance.waitForOutput(
    "We couldn't find artifacts",
    {
      optional: true,
      timeout: 5000,
    },
  );

  // ./dist is the default value, no need to change it
  wizardInstance.sendStdin(KEYS.ENTER);

  const optionalArtifactsNotFoundPrompted =
    await optionalArtifactsNotFoundPromise;

  if (optionalArtifactsNotFoundPrompted) {
    wizardInstance.sendStdin(KEYS.DOWN);
    wizardInstance.sendStdin(KEYS.ENTER);
  }

  await sourcemapsConfiguredPromise;

  await buildScriptPromptedPromise;

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER], // yes, automatically add sentry:sourcemaps script
    'Is yarn build your production build command?',
  );

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER], // yes, yarn build is the production build command
    'Are you using a CI/CD tool to build and deploy your application?',
  );

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.DOWN, KEYS.ENTER], // no CI/CD tool
    'Do you want to create an example component to test your Sentry setup?',
  );

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER], // yes, create example component
    'Did you apply the snippet above?',
  );

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER], // yes, applied the snippet
    'Looks like you have Prettier in your project. Do you want to run it on your files?',
  );

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER], // yes, run prettier
    'Successfully installed the Sentry Angular SDK!',
  );

  wizardInstance.kill();
}

function checkAngularProject(
  projectDir: string,
  integration: Integration,
  options?: {
    preExistingErrorHandler?: boolean;
  },
) {
  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, integration);

    const packageJsonFile = path.resolve(projectDir, 'package.json');
    checkFileContents(packageJsonFile, [
      `"sentry:sourcemaps": "sentry-cli sourcemaps inject --org ${TEST_ARGS.ORG_SLUG} --project ${TEST_ARGS.PROJECT_SLUG} ./dist && sentry-cli sourcemaps upload --org ${TEST_ARGS.ORG_SLUG} --project ${TEST_ARGS.PROJECT_SLUG} ./dist"`,
      `"build": "ng build && yarn sentry:sourcemaps"`,
    ]);
  });

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
      options?.preExistingErrorHandler
        ? `provide: ErrorHandler,
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

  test('angular.json is updated correctly', async () => {
    const angularJsonFile = path.resolve(projectDir, 'angular.json');
    checkFileExists(angularJsonFile);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const angularJson = (await import(angularJsonFile)) as Record<string, any>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [, project] of Object.entries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      angularJson.projects as Record<string, any>,
    )) {
      expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        project?.architect?.build?.configurations?.production?.sourceMap,
      ).toBe(true);
    }
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(
      projectDir,
      'Application bundle generation complete.',
    );
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(
      projectDir,
      'Application bundle generation complete.',
    );
  });
}
