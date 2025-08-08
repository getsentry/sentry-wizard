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
import { afterAll, beforeAll, describe, test } from 'vitest';

describe('NextJS-14', () => {
  const integration = Integration.nextjs;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nextjs-14-test-app',
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
        [KEYS.DOWN, KEYS.ENTER],
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

    const logOptionPrompted =
      replayOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        // "Do you want to enable Logs", sometimes doesn't work as `Logs` can be printed in bold.
        'to send your application logs to Sentry?',
      ));

    const examplePagePrompted =
      logOptionPrompted &&
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

    // Selecting `No` for CI/CD tool
    const ciSelected =
      ciCdPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.DOWN, KEYS.ENTER],
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
        { optional: true },
      ));

    // Decline optional MCP config (default No)
    const mcpPrompted =
      (ciSelected || ciCdPrompted) &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
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
    checkFileExists(`${projectDir}/src/app/layout.tsx`);
    checkFileExists(`${projectDir}/src/app/sentry-example-page/page.tsx`);
    checkFileExists(`${projectDir}/src/app/api/sentry-example-api/route.ts`);
  });

  test('config files created', () => {
    checkFileExists(`${projectDir}/sentry.server.config.ts`);
    checkFileExists(`${projectDir}/sentry.edge.config.ts`);
  });

  test('global error file exists', () => {
    checkFileExists(`${projectDir}/src/app/global-error.tsx`);
  });

  test('instrumentation files exists', () => {
    checkFileExists(`${projectDir}/src/instrumentation.ts`);
    checkFileExists(`${projectDir}/src/instrumentation-client.ts`);
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
    await checkIfBuilds(projectDir);
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Ready in');
  });

  test('root layout contains generateMetadata function', () => {
    checkFileContents(`${projectDir}/src/app/layout.tsx`, [
      "// This file was generated by the Sentry wizard because we couldn't find a root layout file.",
      "import * as Sentry from '@sentry/nextjs';",
      "import type { Metadata } from 'next';",
      '',
      'export function generateMetadata(): Metadata {',
      '  return {',
      '    other: {',
      '      ...Sentry.getTraceData(),',
      '    }',
      '  }',
      '};',
      '',
      'export default function RootLayout({',
      '  children,',
      '}: {',
      '  children: React.ReactNode',
      '}) {',
      '  return (',
      '    <html lang="en">',
      '      <body>{children}</body>',
      '    </html>',
      '  )',
      '}',
    ]);
  });
});
