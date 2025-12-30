import * as fs from 'node:fs';
import { Integration } from '../../lib/Constants';
import {
  KEYS,
  checkEnvBuildPlugin,
  checkFileDoesNotExist,
  createIsolatedTestEnv,
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
import { describe, beforeAll, afterAll, test, expect } from 'vitest';

describe('NextJS-15', () => {
  const integration = Integration.nextjs;
  let projectDir: string;
  let cleanup: () => void;

  beforeAll(async () => {
    const testEnv = createIsolatedTestEnv('nextjs-15-test-app');
    projectDir = testEnv.projectDir;
    cleanup = testEnv.cleanup;

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
    const mcpPrompted =
      ciCdPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.DOWN, KEYS.ENTER],
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
        { optional: true },
      ));

    // Accept MCP config (default is now Yes)
    const editorPrompted =
      mcpPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'Which editor(s) do you want to configure?',
      ));

    // Select Cursor as the editor (first option) - SPACE to select, ENTER to confirm
    editorPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.SPACE, KEYS.ENTER],
        'Successfully installed the Sentry Next.js SDK!',
      ));

    wizardInstance.kill();
  });

  afterAll(() => {
    cleanup();
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
      'import * as Sentry from "@sentry/nextjs";',
      `export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;`,
    ]);
  });

  test('next.config file contains Sentry wrapper', () => {
    checkFileContents(`${projectDir}/next.config.ts`, [
      'import { withSentryConfig } from "@sentry/nextjs"',
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

  test('MCP configuration file is created for Cursor', () => {
    checkFileExists(`${projectDir}/.cursor/mcp.json`);
    checkFileContents(`${projectDir}/.cursor/mcp.json`, [
      '"mcpServers"',
      '"Sentry"',
      '"url": "https://mcp.sentry.dev/mcp/sentry-javascript-sdks/sentry-wizard-e2e-tests"',
    ]);
  });
});

describe('NextJS-15 Spotlight', () => {
  const integration = Integration.nextjs;
  let projectDir: string;
  let cleanup: () => void;

  beforeAll(async () => {
    const testEnv = createIsolatedTestEnv('nextjs-15-test-app');
    projectDir = testEnv.projectDir;
    cleanup = testEnv.cleanup;

    const wizardInstance = startWizardInstance(
      integration,
      projectDir,
      false,
      true,
    );

    const spotlightModePrompted = await wizardInstance.waitForOutput(
      'Spotlight mode enabled!',
    );

    const packageManagerPrompted =
      spotlightModePrompted &&
      (await wizardInstance.waitForOutput(
        'Please select your package manager.',
      ));

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
        'to track the performance of your application?',
      ));

    const replayOptionPrompted =
      tracingOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'to get a video-like reproduction of errors during a user session?',
      ));

    const logOptionPrompted =
      replayOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'to send your application logs to Sentry?',
      ));

    // Skip example page creation
    logOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.DOWN, KEYS.ENTER],
        'Successfully installed the Sentry Next.js SDK!',
        {
          optional: true,
        },
      ));

    wizardInstance.kill();
  });

  afterAll(() => {
    cleanup();
  });

  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, integration);
  });

  test('.env-sentry-build-plugin should NOT exist in spotlight mode', () => {
    const envFilePath = `${projectDir}/.env.sentry-build-plugin`;
    checkFileDoesNotExist(envFilePath);
    // Explicit assertion to satisfy linter
    expect(fs.existsSync(envFilePath)).toBe(false);
  });

  test('config files created', () => {
    checkFileExists(`${projectDir}/sentry.server.config.ts`);
    checkFileExists(`${projectDir}/sentry.edge.config.ts`);
  });

  test('server config file contains empty DSN and spotlight flag', () => {
    checkFileContents(`${projectDir}/sentry.server.config.ts`, [
      'dsn: ""',
      'spotlight: true',
    ]);
  });

  test('edge config file contains empty DSN and spotlight flag', () => {
    checkFileContents(`${projectDir}/sentry.edge.config.ts`, [
      'dsn: ""',
      'spotlight: true',
    ]);
  });

  test('instrumentation client file contains empty DSN and spotlight flag', () => {
    checkFileExists(`${projectDir}/src/instrumentation-client.ts`);
    checkFileContents(`${projectDir}/src/instrumentation-client.ts`, [
      'dsn: ""',
      'spotlight: true',
    ]);
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'Ready in');
  });
});
