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
} from '../utils';
import * as path from 'path';

describe('NextJS', () => {
  const integration = Integration.nextjs;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nextjs-test-app',
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

    const routeThroughNextJsPrompted = await wizardInstance.waitForOutput(
      'Do you want to route Sentry requests in the browser through your Next.js server',
      {
        timeout: 240_000,
      },
    );

    if (routeThroughNextJsPrompted) {
      wizardInstance.sendStdin(KEYS.ENTER);
    }

    const reactComponentAnnotationsPrompted =
      await wizardInstance.waitForOutput(
        'Do you want to enable React component annotations',
      );

    if (reactComponentAnnotationsPrompted) {
      wizardInstance.sendStdin(KEYS.ENTER);
    }

    const tracingOptionPrompted = await wizardInstance.waitForOutput(
      'Do you want to enable Tracing',
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
    }

    const ciCdPrompted = await wizardInstance.waitForOutput(
      'Are you using a CI/CD tool',
    );

    if (ciCdPrompted) {
      // Selecting `No` for CI/CD tool
      wizardInstance.sendStdin(KEYS.DOWN);
      wizardInstance.sendStdin(KEYS.ENTER);
    }

    await wizardInstance.waitForOutput(
      'Successfully installed the Sentry Next.js SDK!',
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
    checkFileContents(`${projectDir}/next.config.mjs`, [
      "import {withSentryConfig} from '@sentry/nextjs'",
      'export default withSentryConfig(nextConfig, {',
    ]);
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'Ready in');
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir, 'server-rendered on demand');
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Ready in');
  });
});
