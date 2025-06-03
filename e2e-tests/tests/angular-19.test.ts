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
  getWizardCommand,
  initGit,
  KEYS,
  modifyFile,
  revertLocalChanges,
} from '../utils';
import * as path from 'path';
import { TEST_ARGS } from '../utils';
import { test, expect, describe, beforeAll, afterAll } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { withEnv } from 'clifty';

// eslint-disable-next-line vitest/valid-describe-callback
describe.sequential('Angular-19', { retry: 0 }, () => {
  describe('with empty project', () => {
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/angular-19-test-app',
    );

    beforeAll(async () => {
      initGit(projectDir);
      revertLocalChanges(projectDir);
      await runWizardOnAngularProject(projectDir);
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkAngularProject(projectDir);
  });
  describe('with pre-defined ErrorHandler', () => {
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/angular-19-test-app',
    );

    beforeAll(async () => {
      revertLocalChanges(projectDir);
      await runWizardOnAngularProject(projectDir, (projectDir) => {
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

    checkAngularProject(projectDir, {
      preExistingErrorHandler: true,
    });
  });
});

async function runWizardOnAngularProject(
  projectDir: string,
  fileModificationFn?: (projectDir: string) => unknown,
) {
  const interactionBuilder = withEnv({
    cwd: projectDir,
    debug: true,
  }).defineInteraction();

  if (fileModificationFn) {
    fileModificationFn(projectDir);

    interactionBuilder.step(
      'confirm continue with dirty repo',
      ({ whenAsked }) => {
        whenAsked('Do you want to continue anyway?').respondWith(KEYS.ENTER);
      },
    );
  }

  await interactionBuilder
    .step('select package manager', ({ expectOutput, whenAsked }) => {
      expectOutput('Please select your package manager.');
      whenAsked('Please select your package manager.').respondWith(
        KEYS.DOWN,
        KEYS.ENTER,
      );
      expectOutput('Installing @sentry/angular');
    })
    .step('feature selection', ({ whenAsked, expectOutput }) => {
      whenAsked('to track the performance of your application?', {
        // 1st question after package installation
        timeout: 240_000,
      }).respondWith(KEYS.ENTER);

      whenAsked(
        'to get a video-like reproduction of errors during a user session?',
      ).respondWith(KEYS.ENTER);

      expectOutput('Successfully initialized Sentry on main.ts');

      if (fileModificationFn) {
        expectOutput(
          'ErrorHandler provider already exists in your app config.',
        );
        expectOutput(
          'https://docs.sentry.io/platforms/javascript/guides/angular/features/error-handler/',
        );
      }

      expectOutput('Successfully updated your app config app.config.ts');
    })
    .step('source maps', ({ whenAsked, expectOutput }) => {
      expectOutput('Installing @sentry/cli');

      // .dist is the default value, no need to change it
      whenAsked('Where are your build artifacts located?', {
        // installing @sentry/cli takes a while
        timeout: 240_000,
      })
        .respondWith(KEYS.ENTER)
        .expectOutput('dist');

      // no build artifacts found when running the wizard without a prior build
      whenAsked(
        'Are you sure that this is the location that contains your build artifacts?',
      ).respondWith(KEYS.DOWN, KEYS.ENTER);

      whenAsked(
        'Do you want to automatically run the sentry:sourcemaps script after each production build?',
      ).respondWith(KEYS.ENTER);

      expectOutput('Added a sentry:sourcemaps script to your package.json');

      whenAsked('Is yarn build your production build command?').respondWith(
        KEYS.ENTER,
      );

      whenAsked(
        'Are you using a CI/CD tool to build and deploy your application?',
      ).respondWith(
        // no CI/CD tool (no need to show the token in the test)
        KEYS.DOWN,
        KEYS.ENTER,
      );
    })
    .step('create example component', ({ whenAsked }) => {
      whenAsked(
        'Do you want to create an example component to test your Sentry setup?',
      ).respondWith(KEYS.ENTER);

      whenAsked('Did you apply the snippet above?').respondWith(KEYS.ENTER);
    })
    .whenAsked(
      'Looks like you have Prettier in your project. Do you want to run it on your files?',
    )
    .respondWith(KEYS.ENTER)
    .expectOutput('Successfully installed the Sentry Angular SDK!')
    .run(getWizardCommand(Integration.angular));
}

function checkAngularProject(
  projectDir: string,
  options?: {
    preExistingErrorHandler?: boolean;
  },
) {
  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, Integration.angular);

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
      `provideAppInitializer(() => {
      inject(Sentry.TraceService);
    })`,
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
