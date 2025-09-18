import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  KEYS,
  TEST_ARGS,
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  cleanupGit,
  revertLocalChanges,
  startWizardInstance,
} from '../utils';
import { afterAll, beforeAll, describe, test, expect } from 'vitest';

async function runWizardOnReactRouterProject(
  projectDir: string,
  integration: Integration,
  fileModificationFn?: (
    projectDir: string,
    integration: Integration,
  ) => unknown,
) {
  const wizardInstance = startWizardInstance(integration, projectDir);
  let packageManagerPrompted = false;

  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);

    await wizardInstance.waitForOutput('Do you want to continue anyway?');

    packageManagerPrompted = await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Please select your package manager.',
    );
  } else {
    packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );
  }

  const tracingOptionPrompted =
    packageManagerPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      // Selecting `yarn` as the package manager
      [KEYS.DOWN, KEYS.ENTER],
      // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
      'to track the performance of your application?',
      {
        timeout: 240_000,
      },
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

  // After the example page prompt, we send ENTER to accept it
  // Then handle the MCP prompt that comes after
  const mcpPrompted =
    examplePagePrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],  // This ENTER is for accepting the example page
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      {
        optional: true,
      },
    ));

  // Decline MCP config (default is Yes, so press DOWN then ENTER to select No)
  if (mcpPrompted) {
    await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'Successfully installed the Sentry React Router SDK!',
    );
  } else {
    // If MCP wasn't prompted, wait for success message directly
    await wizardInstance.waitForOutput(
      'Successfully installed the Sentry React Router SDK!',
    );
  }

  wizardInstance.kill();
}

function checkReactRouterProject(
  projectDir: string,
  integration: Integration,
  options?: {
    devModeExpectedOutput?: string;
    prodModeExpectedOutput?: string;
  },
) {
  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, integration);
  });

  test('.env.sentry-build-plugin is created and contains the auth token', () => {
    checkEnvBuildPlugin(projectDir);
  });

  test('example page exists', () => {
    checkFileExists(`${projectDir}/app/routes/sentry-example-page.tsx`);
  });

  test('instrumentation.server file exists', () => {
    checkFileExists(`${projectDir}/instrumentation.server.mjs`);
  });

  test('entry.client file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/app/entry.client.tsx`, [
      'import { init, replayIntegration, reactRouterTracingIntegration } from "@sentry/react-router";',
      `init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    enableLogs: true,

    integrations: [reactRouterTracingIntegration(), replayIntegration({
        maskAllText: true,
        blockAllMedia: true
    })],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1
})`,
    ]);
  });

  test('entry.server file contains instrumented handleError', () => {
    checkFileContents(`${projectDir}/app/entry.server.tsx`, [
      'import * as Sentry from "@sentry/react-router";',
      `export const handleError = Sentry.createSentryHandleError({
  logErrors: false
});`,
    ]);
  });

  test('entry.server file contains instrumented handleRequest', () => {
    checkFileContents(`${projectDir}/app/entry.server.tsx`, [
      'import * as Sentry from "@sentry/react-router";',
      'pipe(Sentry.getMetaTagTransformer(body));',
      'export default Sentry.wrapSentryHandleRequest(handleRequest);'
    ]);
  });

  test('instrumentation.server file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/instrumentation.server.mjs`, [
      'import * as Sentry from "@sentry/react-router";',
      `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    enableLogs: true
})`,
    ]);
  });

  test('root file contains Sentry ErrorBoundary', () => {
    checkFileContents(`${projectDir}/app/root.tsx`, [
      'import * as Sentry from "@sentry/react-router";',
      'export function ErrorBoundary',
      'Sentry.captureException(error)',
      'isRouteErrorResponse(error)',
    ]);
  });

  test('example page contains proper error throwing loader', () => {
    checkFileContents(`${projectDir}/app/routes/sentry-example-page.tsx`, [
      'export async function loader()',
      'throw new Error("some error thrown in a loader")',
      'export default function SentryExamplePage()',
      'Loading this page will throw an error',
    ]);
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(
      projectDir,
      options?.devModeExpectedOutput || 'to expose',
    );
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(
      projectDir,
      options?.prodModeExpectedOutput || 'react-router-serve',
    );
  });
}

async function testWizardPlaceholder(
  projectDir: string,
  integration: Integration,
) {
  const wizardInstance = startWizardInstance(integration, projectDir);

  // The wizard should show the welcome message and then complete
  const welcomePrompted = await wizardInstance.waitForOutput(
    'Sentry React Router Wizard',
    { timeout: 30000 }
  );

  expect(welcomePrompted).toBe(true);

  // Wait a moment for the wizard to process
  await new Promise(resolve => setTimeout(resolve, 2000));

  wizardInstance.kill();
}

describe('React Router', () => {
  describe('wizard basic functionality', () => {
    const integration = Integration.reactRouter;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/react-router-test-app',
    );

    beforeAll(() => {
      // Initialize the test project for wizard testing
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    test('wizard starts correctly', async () => {
      const result = await testWizardPlaceholder(projectDir, integration);
      expect(result).toBeUndefined(); // Test completed successfully
    });

    test('app is properly configured for React Router v7', () => {
      // Verify the test app has the right structure and dependencies
      // This validates that our e2e test infrastructure is ready

      // Check package.json has React Router v7 dependencies
      const packageJsonPath = path.join(projectDir, 'package.json');
      checkFileExists(packageJsonPath);
      checkFileContents(packageJsonPath, [
        '"@react-router/dev": "^7',
        '"react-router": "^7',
        '"@react-router/serve": "^7'
      ]);

      // Check app directory structure exists
      checkFileExists(path.join(projectDir, 'app/root.tsx'));
      checkFileExists(path.join(projectDir, 'app/routes.ts'));
      checkFileExists(path.join(projectDir, 'app/routes/home.tsx'));
      checkFileExists(path.join(projectDir, 'app/routes/about.tsx'));
      checkFileExists(path.join(projectDir, 'app/routes/contact.tsx'));

      // Check configuration files
      checkFileExists(path.join(projectDir, 'vite.config.ts'));
      checkFileExists(path.join(projectDir, 'react-router.config.ts'));
      checkFileExists(path.join(projectDir, '.gitignore'));

      // Check vite config uses React Router plugin
      checkFileContents(path.join(projectDir, 'vite.config.ts'), [
        'import { reactRouter } from "@react-router/dev/vite"',
        'reactRouter()'
      ]);
    });
  });

  describe('with empty project', () => {
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/react-router-test-app',
    );

    beforeAll(async () => {
      await runWizardOnReactRouterProject(projectDir, Integration.reactRouter);
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkReactRouterProject(projectDir, Integration.reactRouter);
  });
});
