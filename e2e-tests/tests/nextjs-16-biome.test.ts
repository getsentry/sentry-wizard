import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import { KEYS, cleanupGit, revertLocalChanges } from '../utils';
import { startWizardInstance } from '../utils';
import {
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfLints,
  checkPackageJson,
} from '../utils';
import { describe, beforeAll, afterAll, test } from 'vitest';

describe('NextJS-16 with Biome', () => {
  const integration = Integration.nextjs;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nextjs-16-biome-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(integration, projectDir);

    // Wait for either package manager prompt or routing prompt (npm may be auto-detected)
    const initialPrompt = await wizardInstance.waitForOutput(
      'Do you want to route Sentry requests in the browser through your Next.js server',
      {
        timeout: 300_000,
      },
    );

    const tracingOptionPrompted =
      initialPrompt &&
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
    const ciCdPrompted =
      logOptionPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.DOWN, KEYS.ENTER],
        'Are you using a CI/CD tool',
        {
          optional: true,
        },
      ));

    // Selecting `No` for CI/CD tool
    const biomePrompted =
      ciCdPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.DOWN, KEYS.ENTER],
        'Looks like you have Biome in your project',
        { optional: true },
      ));

    // Accept Biome formatting (default is Yes)
    const mcpPrompted =
      biomePrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.ENTER],
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
        { optional: true },
      ));

    // Skip MCP config
    mcpPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.DOWN, KEYS.ENTER],
        'Successfully installed the Sentry Next.js SDK!',
        { optional: true },
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

  test('config files created', () => {
    checkFileExists(`${projectDir}/sentry.server.config.ts`);
    checkFileExists(`${projectDir}/sentry.edge.config.ts`);
  });

  test('global error file exists', () => {
    checkFileExists(`${projectDir}/app/global-error.tsx`);
  });

  test('instrumentation files exist', () => {
    checkFileExists(`${projectDir}/instrumentation.ts`);
    checkFileExists(`${projectDir}/instrumentation-client.ts`);
  });

  test('instrumentation file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/instrumentation.ts`, [
      "import * as Sentry from '@sentry/nextjs';",
    ]);
  });

  test('next.config file contains Sentry wrapper', () => {
    checkFileContents(`${projectDir}/next.config.ts`, ['withSentryConfig']);
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });

  test('lints correctly with Biome', async () => {
    await checkIfLints(projectDir);
  });
});
