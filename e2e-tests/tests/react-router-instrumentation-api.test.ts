import { afterAll, beforeAll, describe, test, expect } from 'vitest';
import { Integration } from '../../lib/Constants';
import {
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  createIsolatedTestEnv,
  getWizardCommand,
} from '../utils';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

// Expects React Router >= 7.9.5
async function runWizardWithInstrumentationAPI(
  projectDir: string,
): Promise<number> {
  const wizardInteraction = withEnv({
    cwd: projectDir,
  }).defineInteraction();

  wizardInteraction
    .whenAsked('Please select your package manager.')
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .expectOutput('Installing @sentry/react-router')
    .expectOutput('Installed @sentry/react-router', {
      timeout: 240_000,
    })

    .whenAsked('Do you want to enable Tracing')
    .respondWith(KEYS.ENTER) // Yes
    .whenAsked('Do you want to enable Session Replay')
    .respondWith(KEYS.ENTER) // Yes
    .whenAsked('Do you want to enable Logs')
    .respondWith(KEYS.ENTER) // Yes
    .whenAsked('Do you want to enable Profiling')
    .respondWith(KEYS.ENTER) // Yes
    .whenAsked('Do you want to use the Instrumentation API')
    .respondWith(KEYS.ENTER) // Yes
    .expectOutput('Installing @sentry/profiling-node')
    .expectOutput('Installed @sentry/profiling-node', {
      timeout: 240_000,
    })
    .whenAsked('Do you want to create an example page')
    .respondWith(KEYS.ENTER); // Yes

  return wizardInteraction
    .whenAsked(
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
    )
    .respondWith(KEYS.DOWN, KEYS.ENTER) // No
    .expectOutput('Successfully installed the Sentry React Router SDK!')
    .run(getWizardCommand(Integration.reactRouter));
}

describe('React Router Instrumentation API', () => {
  describe('with Instrumentation API enabled', () => {
    let wizardExitCode: number;
    const { projectDir, cleanup } = createIsolatedTestEnv(
      'react-router-test-app',
    );

    beforeAll(async () => {
      wizardExitCode = await runWizardWithInstrumentationAPI(projectDir);
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('package.json is updated correctly', () => {
      checkPackageJson(projectDir, '@sentry/react-router');
    });

    test('.env.sentry-build-plugin is created and contains the auth token', () => {
      checkEnvBuildPlugin(projectDir);
    });

    test('entry.client file contains Instrumentation API setup', () => {
      checkFileContents(`${projectDir}/app/entry.client.tsx`, [
        'import * as Sentry from',
        '@sentry/react-router',
        'const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });',
        'integrations: [tracing',
        'unstable_instrumentations={[tracing.clientInstrumentation]}',
      ]);
    });

    test('entry.server file contains Sentry server hooks', () => {
      checkFileContents(`${projectDir}/app/entry.server.tsx`, [
        'import * as Sentry from',
        '@sentry/react-router',
        'Sentry.wrapSentryHandleRequest(',
        'export const handleError = Sentry.createSentryHandleError(',
        'export const unstable_instrumentations = [Sentry.createSentryServerInstrumentation()]',
      ]);
    });

    test('instrument.server file exists', () => {
      checkFileExists(`${projectDir}/instrument.server.mjs`);
    });

    test('example page exists', () => {
      checkFileExists(`${projectDir}/app/routes/sentry-example-page.tsx`);
    });

    test('builds successfully', async () => {
      await checkIfBuilds(projectDir);
    }, 60_000);

    test('runs on dev mode correctly', async () => {
      await checkIfRunsOnDevMode(projectDir, 'to expose');
    }, 30_000);

    test('runs on prod mode correctly', async () => {
      await checkIfRunsOnProdMode(projectDir, 'react-router-serve');
    }, 30_000);
  });
});
