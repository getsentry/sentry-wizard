import { Integration } from '../../lib/Constants';
import {
  checkFileContents,
  checkFileDoesNotContain,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  createIsolatedTestEnv,
  getWizardCommand,
  modifyFile,
} from '../utils';
import * as path from 'path';
import { TEST_ARGS } from '../utils';
import { test, expect, describe, beforeAll, afterAll, it } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('Angular-17', () => {
  describe('with empty project', () => {
    const integration = Integration.angular;
    let wizardExitCode: number;

    const { projectDir, cleanup } = createIsolatedTestEnv(
      'angular-17-test-app',
    );

    beforeAll(async () => {
      wizardExitCode = await runWizardOnAngularProject(projectDir, integration);
    });

    afterAll(() => {
      cleanup();
    });

    it('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    checkAngularProject(projectDir, integration);
  });

  describe('with pre-defined ErrorHandler', () => {
    const integration = Integration.angular;
    let wizardExitCode: number;

    const { projectDir, cleanup } = createIsolatedTestEnv(
      'angular-17-test-app',
    );

    beforeAll(async () => {
      wizardExitCode = await runWizardOnAngularProject(
        projectDir,
        integration,
        (projectDir) => {
          modifyFile(`${projectDir}/src/app/app.config.ts`, {
            'providers: [': `providers: [{
            provide: ErrorHandler,
            useValue: null
            },
            `,
          });
        },
      );
    });

    afterAll(() => {
      cleanup();
    });

    it('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
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
): Promise<number> {
  const wizardInteraction = withEnv({
    cwd: projectDir,
    debug: true,
  }).defineInteraction();

  if (fileModificationFn) {
    fileModificationFn(projectDir);

    wizardInteraction
      .whenAsked('Do you want to continue anyway?')
      .respondWith(KEYS.ENTER);
  }

  return (
    wizardInteraction
      .whenAsked('Please select your package manager.')
      .respondWith(KEYS.ENTER) // npm is the default for Angular
      .expectOutput('Installing @sentry/angular')
      // Installing the sdk can take a while in CI
      .expectOutput('Installed @sentry/angular with NPM.', {
        timeout: 240_000,
      })
      .whenAsked('Do you want to enable Tracing')
      .respondWith(KEYS.ENTER) // yes
      .whenAsked('Do you want to enable Session Replay')
      .respondWith(KEYS.ENTER) // yes
      .whenAsked('Do you want to enable Logs')
      .respondWith(KEYS.ENTER) // yes
      .expectOutput('initialized Sentry in main.ts', {
        timeout: 10_000,
      })
      .expectOutput('updated your app config app.config.ts')
      .expectOutput('Installing @sentry/cli')
      .expectOutput('Installed @sentry/cli@', {
        timeout: 240_000, // installing Sentry CLI can take a while in CI
      })
      .whenAsked('Where are your build artifacts located?')
      .respondWith(KEYS.ENTER) // ./dist is the default value
      .whenAsked(
        'We couldn\'t find build artifacts at "./dist". What would you like to do?',
      )
      .respondWith(KEYS.DOWN, KEYS.DOWN, KEYS.ENTER) // Proceed anyway (this is expected)
      .whenAsked(
        'Do you want to automatically run the sentry:sourcemaps script after each production build?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER) // no - we can't upload in CI when testing building
      .whenAsked(
        'Are you using a CI/CD tool to build and deploy your application?',
      )
      .respondWith(KEYS.ENTER)
      .whenAsked(
        'Add a step to your CI pipeline that runs the sentry:sourcemaps script right after building your application',
      )
      .respondWith(KEYS.ENTER)
      .expectOutput(
        'Add the Sentry authentication token as an environment variable to your CI setup:',
      )
      .expectOutput('SENTRY_AUTH_TOKEN=')
      .whenAsked('Did you configure CI as shown above?')
      .respondWith(KEYS.ENTER) // yes
      .whenAsked(
        'Do you want to create an example component to test your Sentry setup?',
      )
      .respondWith(KEYS.ENTER)
      .whenAsked('Did you apply the snippet above?')
      .respondWith(KEYS.ENTER)
      .whenAsked(
        'Looks like you have Prettier in your project. Do you want to run it on your files?',
      )
      .respondWith(KEYS.ENTER)
      .whenAsked(
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER)
      .expectOutput('Successfully installed the Sentry Angular SDK!')
      .run(getWizardCommand(integration))
  );
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
      `"build": "ng build"`,
    ]);
  });

  test('Sentry is correctly injected into Angular app config', () => {
    const appConfigFile = path.resolve(projectDir, 'src/main.ts');
    checkFileExists(appConfigFile);

    checkFileContents(appConfigFile, [
      `import * as Sentry from "@sentry/angular";`,
      'Sentry.init({',
      TEST_ARGS.PROJECT_DSN,
      'Sentry.browserTracingIntegration()',
      'Sentry.replayIntegration()',
      'tracesSampleRate: 1',
      'replaysSessionSampleRate: 0.1',
      'replaysOnErrorSampleRate: 1',
      'enableLogs: true',
      'sendDefaultPii: true',
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
      `import * as Sentry from "@sentry/angular";`,
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
