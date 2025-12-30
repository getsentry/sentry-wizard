import * as fs from 'node:fs';
import { Integration } from '../../lib/Constants';
import {
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfLints,
  checkPackageJson,
  createIsolatedTestEnv,
  getWizardCommand,
  initGit,
  revertLocalChanges,
} from '../utils';
import { describe, beforeAll, afterAll, test, expect } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('NextJS-16 with Prettier, Biome, and ESLint', () => {
  const integration = Integration.nextjs;

  const { projectDir, cleanup } = createIsolatedTestEnv('nextjs-16-test-app');

  beforeAll(async () => {
    initGit(projectDir);
    revertLocalChanges(projectDir);

    await withEnv({
      cwd: projectDir,
    })
      .defineInteraction()
      .whenAsked('Please select your package manager', {
        timeout: 300_000,
      })
      .respondWith(KEYS.ENTER) // Select npm (first option)
      .whenAsked(
        'Do you want to route Sentry requests in the browser through your Next.js server',
        {
          timeout: 300_000, // package installation can take a while in CI
        },
      )
      .respondWith(KEYS.ENTER)
      .whenAsked('to track the performance of your application?')
      .respondWith(KEYS.ENTER)
      .whenAsked(
        'to get a video-like reproduction of errors during a user session?',
      )
      .respondWith(KEYS.ENTER)
      .whenAsked('to send your application logs to Sentry?')
      .respondWith(KEYS.ENTER)
      .whenAsked('Do you want to create an example page')
      .respondWith(KEYS.DOWN, KEYS.ENTER) // Skip example page
      .whenAsked('Are you using a CI/CD tool')
      .respondWith(KEYS.DOWN, KEYS.ENTER) // Select No
      .whenAsked(
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER) // Skip MCP config
      .whenAsked('Looks like you have Prettier and Biome in your project')
      .respondWith(KEYS.ENTER) // Accept formatter run
      .expectOutput('Successfully installed the Sentry Next.js SDK!')
      .run(getWizardCommand(integration));
  });

  afterAll(() => {
    cleanup();
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
      'import * as Sentry from "@sentry/nextjs";',
      `export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;`,
    ]);
  });

  test('next.config file contains Sentry wrapper', () => {
    checkFileContents(`${projectDir}/next.config.ts`, [
      'import { withSentryConfig } from "@sentry/nextjs"',
      'withSentryConfig(nextConfig, {',
    ]);
  });

  test('Generated code has proper import formatting', () => {
    const configContent = fs.readFileSync(
      `${projectDir}/next.config.ts`,
      'utf-8',
    );
    // Verify proper spacing: import { withSentryConfig } from
    expect(configContent).toMatch(/import\s+{\s+\w+\s+}\s+from/);
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });

  test('lints correctly', async () => {
    await checkIfLints(projectDir);
  });
});
