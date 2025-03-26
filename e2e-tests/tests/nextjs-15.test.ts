/* eslint-disable jest/expect-expect */
import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  KEYS,
  checkEnvBuildPlugin,
  cleanupGit,
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
} from '../utils';

describe('NextJS-15', () => {
  const integration = Integration.nextjs;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nextjs-15-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);
    const packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );

    const routeThroughNextJsPrompted =
      packageManagerPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Selecting `yarn` as the package manager
        [KEYS.DOWN, KEYS.DOWN, KEYS.ENTER],
        'Do you want to route Sentry requests in the browser through your Next.js server',
        {
          timeout: 240_000,
        },
      ));

    const tracingOptionPrompted =
      routeThroughNextJsPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
        'to track the performance of your application?',
      ));

    const replayOptionPrompted =
      tracingOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        // "Do you want to enable Sentry Session Replay", sometimes doesn't work as `Sentry Session Replay` can be printed in bold.
        'to get a video-like reproduction of errors during a user session?',
      ));

    const examplePagePrompted =
      replayOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'Do you want to create an example page',
        {
          optional: true,
        },
      ));

    const ciCdPrompted =
      examplePagePrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'Are you using a CI/CD tool',
      ));

    ciCdPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        // Selecting `No` for CI/CD tool
        [KEYS.DOWN, KEYS.DOWN, KEYS.ENTER],
        'Successfully installed the Sentry Next.js SDK!',
      ));

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
    checkFileExists(`${projectDir}/src/app/sentry-example-page/page.tsx`);
    checkFileExists(`${projectDir}/src/app/api/sentry-example-api/route.ts`);
  });

  test('config files created', () => {
    checkFileExists(`${projectDir}/sentry.server.config.ts`);
    checkFileExists(`${projectDir}/sentry.client.config.ts`);
    checkFileExists(`${projectDir}/sentry.edge.config.ts`);
  });

  test('global error file exists', () => {
    checkFileExists(`${projectDir}/src/app/global-error.tsx`);
  });

  test('instrumentation file exists', () => {
    checkFileExists(`${projectDir}/src/instrumentation.ts`);
  });

  test('instrumentation file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/src/instrumentation.ts`, [
      "import * as Sentry from '@sentry/nextjs';",
      `export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;`,
    ]);
  });

  test('next.config file contains Sentry wrapper', () => {
    checkFileContents(`${projectDir}/next.config.ts`, [
      'import {withSentryConfig} from "@sentry/nextjs"',
      'export default withSentryConfig(nextConfig, {',
    ]);
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'Ready in');
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Ready in');
  });
});
