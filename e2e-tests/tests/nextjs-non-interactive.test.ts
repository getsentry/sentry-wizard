import * as fs from 'node:fs';
import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import { createIsolatedTestEnv } from '../utils';
import {
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkPackageJson,
} from '../utils';
import { describe, beforeAll, afterAll, test, expect } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { withEnv } from 'clifty';

describe('NextJS Non-Interactive Mode', () => {
  const integration = Integration.nextjs;
  let wizardExitCode: number;

  const { projectDir, cleanup } = createIsolatedTestEnv('nextjs-15-test-app');

  beforeAll(async () => {
    const binName = process.env.SENTRY_WIZARD_E2E_TEST_BIN
      ? ['dist-bin', `sentry-wizard-${process.platform}-${process.arch}`]
      : ['dist', 'bin.js'];
    const binPath = path.join(__dirname, '..', '..', ...binName);

    // Run wizard in non-interactive mode with all features enabled
    const command = [
      binPath,
      '-i',
      integration,
      '--non-interactive',
      '--tracing',
      '--replay',
      '--logs',
      '--example-page',
      '--disable-telemetry',
    ].join(' ');

    wizardExitCode = await withEnv({
      cwd: projectDir,
      debug: true,
    })
      .defineInteraction()
      .expectOutput('Running in non-interactive mode')
      .expectOutput('Successfully installed the Sentry Next.js SDK!')
      .run(command);
  });

  afterAll(() => {
    cleanup();
  });

  test('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, '@sentry/nextjs');
  });

  test('.env.example is created with placeholder values', () => {
    checkFileExists(`${projectDir}/.env.example`);
    checkFileContents(
      `${projectDir}/.env.example`,
      'SENTRY_AUTH_TOKEN=your-auth-token',
    );
  });

  test('instrumentation file is created', () => {
    const hasJs = fs.existsSync(`${projectDir}/src/instrumentation.js`);
    const hasTs = fs.existsSync(`${projectDir}/src/instrumentation.ts`);
    expect(hasJs || hasTs).toBe(true);
  });

  test('sentry.client.config is created', () => {
    const hasJs = fs.existsSync(`${projectDir}/sentry.client.config.js`);
    const hasTs = fs.existsSync(`${projectDir}/sentry.client.config.ts`);
    expect(hasJs || hasTs).toBe(true);
  });

  test('sentry.server.config is created', () => {
    const hasJs = fs.existsSync(`${projectDir}/sentry.server.config.js`);
    const hasTs = fs.existsSync(`${projectDir}/sentry.server.config.ts`);
    expect(hasJs || hasTs).toBe(true);
  });

  test('sentry.edge.config is created', () => {
    const hasJs = fs.existsSync(`${projectDir}/sentry.edge.config.js`);
    const hasTs = fs.existsSync(`${projectDir}/sentry.edge.config.ts`);
    expect(hasJs || hasTs).toBe(true);
  });

  test('example page is created', () => {
    const hasExample =
      fs.existsSync(`${projectDir}/app/sentry-example-page`) ||
      fs.existsSync(`${projectDir}/src/app/sentry-example-page`);
    expect(hasExample).toBe(true);
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });
});
