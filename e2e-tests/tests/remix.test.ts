/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import {
  checkEnvBuildPlugin,
  cleanupGit,
  KEYS,
  revertLocalChanges,
} from '../utils';
import { startWizardInstance } from '../utils';
import {
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  TEST_ARGS,
} from '../utils';
import * as path from 'path';

describe('Remix', () => {
  const integration = Integration.remix;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/remix-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);
    const packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );

    if (packageManagerPrompted) {
      // Selecting `yarn` as the package manager
      wizardInstance.sendStdin(KEYS.DOWN);
      wizardInstance.sendStdin(KEYS.ENTER);
    }

    const tracingOptionPrompted = await wizardInstance.waitForOutput(
      'Do you want to enable Tracing',
      {
        timeout: 240_000,
      },
    );

    if (tracingOptionPrompted) {
      wizardInstance.sendStdin(KEYS.ENTER);
    }

    const replayOptionPrompted = await wizardInstance.waitForOutput(
      'Do you want to enable Sentry Session Replay',
    );

    if (replayOptionPrompted) {
      wizardInstance.sendStdin(KEYS.ENTER);
    }

    const examplePagePrompted = await wizardInstance.waitForOutput(
      'Do you want to create an example page',
      {
        optional: true,
      },
    );

    if (examplePagePrompted) {
      wizardInstance.sendStdin(KEYS.ENTER);
      wizardInstance.sendStdin(KEYS.ENTER);
    }

    await wizardInstance.waitForOutput(
      'Sentry has been successfully configured for your Remix project',
    );

    wizardInstance.kill();
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, integration);
  });

  test('.env-sentry-build-plugin is created and contains the auth token', () => {
    checkEnvBuildPlugin(projectDir);
  });

  test('example page exists', () => {
    checkFileExists(`${projectDir}/app/routes/sentry-example-page.tsx`);
  });

  test('instrumentation.server file exists', () => {
    checkFileExists(`${projectDir}/instrumentation.server.mjs`);
  });

  test('entry.client file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/app/entry.client.tsx`, [
      'import * as Sentry from "@sentry/remix";',
      `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,

    integrations: [Sentry.browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches
    }), Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true
    })],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1
})`,
    ]);
  });

  test('entry.server file contains Sentry code', () => {
    checkFileContents(`${projectDir}/app/entry.server.tsx`, [
      'import * as Sentry from "@sentry/remix";',
      `export const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  // Custom handleError implementation
});`,
    ]);
  });

  test('instrumentation.server file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/instrumentation.server.mjs`, [
      'import * as Sentry from "@sentry/remix";',
      `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    autoInstrumentRemix: true
})`,
    ]);
  });

  test('root file contains Sentry ErrorBoundary', () => {
    checkFileContents(`${projectDir}/app/root.tsx`, [
      'import { captureRemixErrorBoundaryError } from "@sentry/remix";',
      `export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};`,
    ]);
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir, 'built');
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'to expose');
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, '[remix-serve]');
  });
});
