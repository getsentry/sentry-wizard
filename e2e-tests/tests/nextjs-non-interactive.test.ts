import * as fs from 'node:fs';
import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  checkFileContents,
  checkFileDoesNotExist,
  checkFileExists,
  checkIfBuilds,
  checkPackageJson,
  createFile,
  createIsolatedTestEnv,
} from '../utils';
import { describe, beforeAll, afterAll, test, expect } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { withEnv } from 'clifty';

/**
 * Helper to get the wizard binary path
 */
function getWizardBinPath(): string {
  const binName = process.env.SENTRY_WIZARD_E2E_TEST_BIN
    ? ['dist-bin', `sentry-wizard-${process.platform}-${process.arch}`]
    : ['dist', 'bin.js'];
  return path.join(__dirname, '..', '..', ...binName);
}

/**
 * Create a minimal package-lock.json to ensure npm is auto-detected as the package manager.
 * This is necessary for non-interactive mode since we can't prompt for package manager selection.
 */
function createPackageLockForNpm(projectDir: string): void {
  const packageLock = {
    name: 'nextjs-test-app',
    lockfileVersion: 3,
    requires: true,
    packages: {},
  };
  createFile(
    path.join(projectDir, 'package-lock.json'),
    JSON.stringify(packageLock, null, 2),
  );
}

describe('NextJS Non-Interactive Mode', () => {
  const integration = Integration.nextjs;
  let wizardExitCode: number;

  const { projectDir, cleanup } = createIsolatedTestEnv('nextjs-15-test-app');

  beforeAll(async () => {
    // Create package-lock.json so npm is auto-detected (avoids package manager prompt)
    createPackageLockForNpm(projectDir);

    const binPath = getWizardBinPath();

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
      .expectOutput('Successfully scaffolded the Sentry Next.js SDK!')
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
    checkFileContents(`${projectDir}/.env.example`, [
      'NEXT_PUBLIC_SENTRY_DSN=',
      'SENTRY_ORG=',
      'SENTRY_PROJECT=',
      'SENTRY_AUTH_TOKEN=',
    ]);
  });

  test('.env.sentry-build-plugin should NOT exist in non-interactive mode', () => {
    checkFileDoesNotExist(`${projectDir}/.env.sentry-build-plugin`);
  });

  test('instrumentation file is created', () => {
    const hasJs = fs.existsSync(`${projectDir}/src/instrumentation.js`);
    const hasTs = fs.existsSync(`${projectDir}/src/instrumentation.ts`);
    expect(hasJs || hasTs).toBe(true);
  });

  test('instrumentation-client file is created and uses env var for DSN', () => {
    const hasJs = fs.existsSync(`${projectDir}/src/instrumentation-client.js`);
    const hasTs = fs.existsSync(`${projectDir}/src/instrumentation-client.ts`);
    expect(hasJs || hasTs).toBe(true);

    const filePath = hasTs
      ? `${projectDir}/src/instrumentation-client.ts`
      : `${projectDir}/src/instrumentation-client.js`;
    checkFileContents(filePath, 'process.env.NEXT_PUBLIC_SENTRY_DSN');
  });

  test('sentry.server.config is created and uses env var for DSN', () => {
    const hasJs = fs.existsSync(`${projectDir}/sentry.server.config.js`);
    const hasTs = fs.existsSync(`${projectDir}/sentry.server.config.ts`);
    expect(hasJs || hasTs).toBe(true);

    const filePath = hasTs
      ? `${projectDir}/sentry.server.config.ts`
      : `${projectDir}/sentry.server.config.js`;
    checkFileContents(filePath, 'process.env.NEXT_PUBLIC_SENTRY_DSN');
  });

  test('sentry.edge.config is created and uses env var for DSN', () => {
    const hasJs = fs.existsSync(`${projectDir}/sentry.edge.config.js`);
    const hasTs = fs.existsSync(`${projectDir}/sentry.edge.config.ts`);
    expect(hasJs || hasTs).toBe(true);

    const filePath = hasTs
      ? `${projectDir}/sentry.edge.config.ts`
      : `${projectDir}/sentry.edge.config.js`;
    checkFileContents(filePath, 'process.env.NEXT_PUBLIC_SENTRY_DSN');
  });

  test('next.config uses env vars for org and project', () => {
    const hasJs = fs.existsSync(`${projectDir}/next.config.js`);
    const hasMjs = fs.existsSync(`${projectDir}/next.config.mjs`);
    const hasTs = fs.existsSync(`${projectDir}/next.config.ts`);
    expect(hasJs || hasMjs || hasTs).toBe(true);

    const filePath = hasTs
      ? `${projectDir}/next.config.ts`
      : hasMjs
      ? `${projectDir}/next.config.mjs`
      : `${projectDir}/next.config.js`;
    checkFileContents(filePath, [
      'process.env.SENTRY_ORG',
      'process.env.SENTRY_PROJECT',
    ]);
  });

  test('example page is created', () => {
    const hasExample =
      fs.existsSync(`${projectDir}/app/sentry-example-page`) ||
      fs.existsSync(`${projectDir}/src/app/sentry-example-page`);
    expect(hasExample).toBe(true);
  });

  test('instrumentation-client contains tracing config (--tracing flag)', () => {
    const filePath = fs.existsSync(
      `${projectDir}/src/instrumentation-client.ts`,
    )
      ? `${projectDir}/src/instrumentation-client.ts`
      : `${projectDir}/src/instrumentation-client.js`;
    checkFileContents(filePath, 'tracesSampleRate');
  });

  test('instrumentation-client contains replay config (--replay flag)', () => {
    const filePath = fs.existsSync(
      `${projectDir}/src/instrumentation-client.ts`,
    )
      ? `${projectDir}/src/instrumentation-client.ts`
      : `${projectDir}/src/instrumentation-client.js`;
    checkFileContents(filePath, 'replayIntegration');
  });

  test('instrumentation-client contains logs config (--logs flag)', () => {
    const filePath = fs.existsSync(
      `${projectDir}/src/instrumentation-client.ts`,
    )
      ? `${projectDir}/src/instrumentation-client.ts`
      : `${projectDir}/src/instrumentation-client.js`;
    checkFileContents(filePath, 'enableLogs: true');
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });
});

describe('NextJS Non-Interactive Mode with MCP', () => {
  const integration = Integration.nextjs;
  let wizardExitCode: number;

  const { projectDir, cleanup } = createIsolatedTestEnv('nextjs-15-test-app');

  beforeAll(async () => {
    // Create package-lock.json so npm is auto-detected (avoids package manager prompt)
    createPackageLockForNpm(projectDir);

    const binPath = getWizardBinPath();

    // Run wizard in non-interactive mode with MCP configuration
    const command = [
      binPath,
      '-i',
      integration,
      '--non-interactive',
      '--tracing',
      '--mcp',
      'cursor',
      '--mcp',
      'opencode',
      '--disable-telemetry',
    ].join(' ');

    wizardExitCode = await withEnv({
      cwd: projectDir,
      debug: true,
    })
      .defineInteraction()
      .expectOutput('Running in non-interactive mode')
      .expectOutput('Adding MCP configurations')
      .expectOutput('Successfully scaffolded the Sentry Next.js SDK!')
      .run(command);
  });

  afterAll(() => {
    cleanup();
  });

  test('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  test('Cursor MCP config is created with base URL (no org/project scope)', () => {
    checkFileExists(`${projectDir}/.cursor/mcp.json`);
    checkFileContents(`${projectDir}/.cursor/mcp.json`, [
      '"mcpServers"',
      '"Sentry"',
      'https://mcp.sentry.dev/mcp',
    ]);
  });

  test('OpenCode MCP config is created with base URL (no org/project scope)', () => {
    checkFileExists(`${projectDir}/.opencode/mcp.json`);
    checkFileContents(`${projectDir}/.opencode/mcp.json`, [
      '"mcpServers"',
      '"Sentry"',
      'https://mcp.sentry.dev/mcp',
    ]);
  });
});

describe('NextJS Non-Interactive Mode - Minimal', () => {
  const integration = Integration.nextjs;
  let wizardExitCode: number;

  const { projectDir, cleanup } = createIsolatedTestEnv('nextjs-15-test-app');

  beforeAll(async () => {
    // Create package-lock.json so npm is auto-detected (avoids package manager prompt)
    createPackageLockForNpm(projectDir);

    const binPath = getWizardBinPath();

    // Run wizard in non-interactive mode with NO feature flags
    // This tests the default behavior where features are disabled
    const command = [
      binPath,
      '-i',
      integration,
      '--non-interactive',
      '--disable-telemetry',
    ].join(' ');

    wizardExitCode = await withEnv({
      cwd: projectDir,
      debug: true,
    })
      .defineInteraction()
      .expectOutput('Running in non-interactive mode')
      .expectOutput('Successfully scaffolded the Sentry Next.js SDK!')
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

  test('instrumentation-client does NOT contain tracing config when --tracing not provided', () => {
    const filePath = fs.existsSync(
      `${projectDir}/src/instrumentation-client.ts`,
    )
      ? `${projectDir}/src/instrumentation-client.ts`
      : `${projectDir}/src/instrumentation-client.js`;

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('tracesSampleRate');
  });

  test('instrumentation-client does NOT contain replay config when --replay not provided', () => {
    const filePath = fs.existsSync(
      `${projectDir}/src/instrumentation-client.ts`,
    )
      ? `${projectDir}/src/instrumentation-client.ts`
      : `${projectDir}/src/instrumentation-client.js`;

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('replayIntegration');
  });

  test('instrumentation-client does NOT contain logs config when --logs not provided', () => {
    const filePath = fs.existsSync(
      `${projectDir}/src/instrumentation-client.ts`,
    )
      ? `${projectDir}/src/instrumentation-client.ts`
      : `${projectDir}/src/instrumentation-client.js`;

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('enableLogs');
  });

  test('example page is NOT created when --example-page not provided', () => {
    const hasExample =
      fs.existsSync(`${projectDir}/app/sentry-example-page`) ||
      fs.existsSync(`${projectDir}/src/app/sentry-example-page`);
    expect(hasExample).toBe(false);
  });

  test('no MCP config files created when --mcp not provided', () => {
    expect(fs.existsSync(`${projectDir}/.cursor/mcp.json`)).toBe(false);
    expect(fs.existsSync(`${projectDir}/.vscode/mcp.json`)).toBe(false);
    expect(fs.existsSync(`${projectDir}/.opencode/mcp.json`)).toBe(false);
  });
});
