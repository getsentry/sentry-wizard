import * as fs from 'node:fs';
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
import { afterAll, beforeAll, describe, test, expect } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

/**
 * Run the wizard on a React Router project with Instrumentation API enabled.
 * This expects React Router >= 7.9.5 to be installed in the project.
 */
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
    // Instrumentation API is part of feature selection (after profiling prompt, before package installations)
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

/**
 * Run the wizard on a React Router project WITHOUT Instrumentation API.
 * This tests the "No" path for the Instrumentation API prompt.
 */
async function runWizardWithoutInstrumentationAPI(
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
    // Instrumentation API is part of feature selection (after profiling prompt, before package installations)
    .whenAsked('Do you want to use the Instrumentation API')
    .respondWith(KEYS.DOWN, KEYS.ENTER) // No
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
      'react-router-instrumentation-api-test-app',
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
        // Check for tracing variable with useInstrumentationAPI
        'const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });',
        // Check that tracing is passed to integrations
        'integrations: [tracing',
        // Check for unstable_instrumentations prop on HydratedRouter
        'unstable_instrumentations={[tracing.clientInstrumentation]}',
      ]);
    });

    test('entry.server file contains unstable_instrumentations export', () => {
      checkFileContents(`${projectDir}/app/entry.server.tsx`, [
        'import * as Sentry from',
        '@sentry/react-router',
        'export const handleError = Sentry.createSentryHandleError(',
        // Check for unstable_instrumentations export with createSentryServerInstrumentation
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

  describe('with Instrumentation API disabled', () => {
    let wizardExitCode: number;
    const { projectDir, cleanup } = createIsolatedTestEnv(
      'react-router-instrumentation-api-test-app',
    );

    beforeAll(async () => {
      wizardExitCode = await runWizardWithoutInstrumentationAPI(projectDir);
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('entry.client file does NOT contain Instrumentation API setup', () => {
      const clientContent = fs.readFileSync(
        `${projectDir}/app/entry.client.tsx`,
        'utf8',
      );

      // Should have Sentry setup
      expect(clientContent).toContain('import * as Sentry from');
      expect(clientContent).toContain('@sentry/react-router');

      // Should NOT have instrumentation API specific code
      expect(clientContent).not.toContain('useInstrumentationAPI: true');
      expect(clientContent).not.toContain('unstable_instrumentations');
      expect(clientContent).not.toContain('tracing.clientInstrumentation');

      // Should have regular tracing integration
      expect(clientContent).toContain('Sentry.reactRouterTracingIntegration()');
    });

    test('entry.server file does NOT contain unstable_instrumentations export', () => {
      const serverContent = fs.readFileSync(
        `${projectDir}/app/entry.server.tsx`,
        'utf8',
      );

      // Should have Sentry setup
      expect(serverContent).toContain('import * as Sentry from');
      expect(serverContent).toContain('@sentry/react-router');
      expect(serverContent).toContain('handleError');

      // Should NOT have instrumentation API specific code
      expect(serverContent).not.toContain('unstable_instrumentations');
      expect(serverContent).not.toContain('createSentryServerInstrumentation');
    });

    test('builds successfully', async () => {
      await checkIfBuilds(projectDir);
    }, 60_000);
  });
});
