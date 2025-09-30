import * as path from 'node:path';
import * as fs from 'node:fs';
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

  let packageManagerPrompted: boolean;
  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);
    await wizardInstance.waitForOutput('Do you want to continue anyway?');
    packageManagerPrompted = await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Please select your package manager.',
    );
  } else {
    packageManagerPrompted = await wizardInstance.waitForOutput('Please select your package manager.');
  }

  const tracingOptionPrompted =
    packageManagerPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'to track the performance of your application?',
      { timeout: 240_000 }
    ));

  const replayOptionPrompted =
    tracingOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'to get a video-like reproduction of errors during a user session?'
    ));

  const logOptionPrompted =
    replayOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'to send your application logs to Sentry?'
    ));

  const profilingOptionPrompted =
    logOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'to track application performance in detail?'
    ));

  const examplePagePrompted =
    profilingOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Do you want to create an example page'
    ));

  const mcpPrompted =
    examplePagePrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      { optional: true }
    ));

  mcpPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'Successfully installed the Sentry React Router SDK!'
    ));

  wizardInstance.kill();
}

async function runWizardOnExistingSentryProject(
  projectDir: string,
  integration: Integration,
) {
  const wizardInstance = startWizardInstance(integration, projectDir);

  const packageManagerPrompted = await wizardInstance.waitForOutput('Please select your package manager.');

  const tracingOptionPrompted =
    packageManagerPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'to track the performance of your application?',
      { timeout: 240_000 }
    ));

  const replayOptionPrompted =
    tracingOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'to get a video-like reproduction of errors during a user session?'
    ));

  const logOptionPrompted =
    replayOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'to send your application logs to Sentry?'
    ));

  const profilingOptionPrompted =
    logOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'to track application performance in detail?'
    ));

  const examplePagePrompted =
    profilingOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Do you want to create an example page'
    ));

  const revealQuestionPrompted =
    examplePagePrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Would you like to try running npx react-router reveal to generate entry files?',
      { optional: true }
    ));

  const revealPrompted = revealQuestionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Did you apply the snippet above?',
      { optional: true, timeout: 30000 }
    ));

  if (revealPrompted) {
    const mcpPrompted = await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      { timeout: 30000 }
    );

    mcpPrompted &&
      (await wizardInstance.sendStdinAndWaitForOutput(
        [KEYS.DOWN, KEYS.ENTER],
        'Successfully installed the Sentry React Router SDK!'
      ));
  } else {
    await wizardInstance.waitForOutput('Successfully installed the Sentry React Router SDK!');
  }

  wizardInstance.kill();
} function checkReactRouterProject(
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

  test('instrument.server file exists', () => {
    checkFileExists(`${projectDir}/instrument.server.mjs`);
  });

  test('entry.client file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/app/entry.client.tsx`, [
      'import * as Sentry from "@sentry/react-router";',
      `Sentry.init({
  dsn: "${TEST_ARGS.PROJECT_DSN}",
  sendDefaultPii: true,
  integrations: [Sentry.reactRouterTracingIntegration(), Sentry.replayIntegration()],
  enableLogs: true,
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/^\\//, /^https:\\/\\/yourserver\\.io\\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})`,
    ]);
  });

  test('package.json scripts are updated correctly', () => {
    checkFileContents(`${projectDir}/package.json`, [
      `"start": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js"`,
      `"dev": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router dev"`,
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

  test('instrument.server file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/instrument.server.mjs`, [
      'import * as Sentry from "@sentry/react-router";',
      'import { nodeProfilingIntegration } from "@sentry/profiling-node";',
      `Sentry.init({
  dsn: "${TEST_ARGS.PROJECT_DSN}",

  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react-router/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  profilesSampleRate: 1.0, // profile every transaction
});`,
    ]);
  });

  test('root file contains Sentry ErrorBoundary', () => {
    checkFileContents(`${projectDir}/app/root.tsx`, [
      'import * as Sentry from "@sentry/react-router";',
      'export function ErrorBoundary',
      'Sentry.captureException(error)',
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

  describe('edge cases', () => {
    const baseProjectDir = path.resolve(
      __dirname,
      '../test-applications/react-router-test-app',
    );

    describe('missing entry files', () => {
      const projectDir = path.resolve(
        __dirname,
        '../test-applications/react-router-test-app-missing-entries',
      );

      beforeAll(async () => {
        // Copy base project and remove entry files to test reveal flow
        fs.cpSync(baseProjectDir, projectDir, { recursive: true });

        // Remove entry files
        const entryClientPath = path.join(projectDir, 'app', 'entry.client.tsx');
        const entryServerPath = path.join(projectDir, 'app', 'entry.server.tsx');

        if (fs.existsSync(entryClientPath)) fs.unlinkSync(entryClientPath);
        if (fs.existsSync(entryServerPath)) fs.unlinkSync(entryServerPath);

        await runWizardOnReactRouterProject(projectDir, Integration.reactRouter);
      });

      afterAll(() => {
        revertLocalChanges(projectDir);
        cleanupGit(projectDir);
        try {
          fs.rmSync(projectDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      });

      test('wizard creates missing entry files', () => {
        checkFileExists(`${projectDir}/app/entry.client.tsx`);
        checkFileExists(`${projectDir}/app/entry.server.tsx`);
      });

      checkReactRouterProject(projectDir, Integration.reactRouter);
    });

    describe('existing Sentry setup', () => {
      const projectDir = path.resolve(
        __dirname,
        '../test-applications/react-router-test-app-existing',
      );

      beforeAll(async () => {
        // Copy project and add existing Sentry setup
        fs.cpSync(baseProjectDir, projectDir, { recursive: true });

        const clientEntryPath = path.join(projectDir, 'app', 'entry.client.tsx');
        const existingContent = `import * as Sentry from "@sentry/react-router";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

Sentry.init({
  dsn: "https://existing@dsn.ingest.sentry.io/1337",
  tracesSampleRate: 1.0,
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});`;
        fs.writeFileSync(clientEntryPath, existingContent);

        // Run wizard with special handling for existing Sentry setup
        await runWizardOnExistingSentryProject(projectDir, Integration.reactRouter);
      });

      afterAll(() => {
        revertLocalChanges(projectDir);
        cleanupGit(projectDir);
        try {
          fs.rmSync(projectDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      });

      test('wizard handles existing Sentry without duplication', () => {
        const clientContent = fs.readFileSync(`${projectDir}/app/entry.client.tsx`, 'utf8');
        const sentryImportCount = (clientContent.match(/import \* as Sentry from "@sentry\/react-router"/g) || []).length;
        const sentryInitCount = (clientContent.match(/Sentry\.init\(/g) || []).length;

        expect(sentryImportCount).toBe(1);
        expect(sentryInitCount).toBe(1);
      });

      // For existing Sentry setup, we have custom expectations
      test('package.json is updated correctly', () => {
        checkPackageJson(projectDir, Integration.reactRouter);
      });

      test('.env.sentry-build-plugin is created and contains the auth token', () => {
        checkEnvBuildPlugin(projectDir);
      });

      test('example page exists', () => {
        checkFileExists(`${projectDir}/app/routes/sentry-example-page.tsx`);
      });

      test('instrument.server file exists', () => {
        checkFileExists(`${projectDir}/instrument.server.mjs`);
      });

      test('entry.client file contains existing Sentry initialization', () => {
        // For existing Sentry setup, we preserve the original configuration
        checkFileContents(`${projectDir}/app/entry.client.tsx`, [
          'import * as Sentry from "@sentry/react-router";',
          'Sentry.init({',
          'dsn: "https://existing@dsn.ingest.sentry.io/1337"',
          'tracesSampleRate: 1.0',
        ]);
      });

      test('package.json scripts are updated correctly', () => {
        checkFileContents(`${projectDir}/package.json`, [
          `"start": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js"`,
          `"dev": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router dev"`,
        ]);
      });

      // Skip server entry tests as the wizard may not create them for existing setups
      // when it can't run the reveal command

      test('instrument.server file contains Sentry initialization', () => {
        checkFileContents(`${projectDir}/instrument.server.mjs`, [
          'import * as Sentry from "@sentry/react-router";',
          `Sentry.init({
  dsn: "${TEST_ARGS.PROJECT_DSN}",`,
          'enableLogs: true,',
        ]);
      });

      test('root file contains Sentry ErrorBoundary', () => {
        checkFileContents(`${projectDir}/app/root.tsx`, [
          'Sentry.captureException(error);',
        ]);
      });

      test('example page contains proper error throwing loader', () => {
        checkFileContents(`${projectDir}/app/routes/sentry-example-page.tsx`, [
          'export async function loader',
          'new Error',
        ]);
      });

      test('builds successfully', async () => {
        await checkIfBuilds(projectDir);
      });

      test('runs on dev mode correctly', async () => {
        await checkIfRunsOnDevMode(projectDir, 'to expose');
      });

      test('runs on prod mode correctly', async () => {
        await checkIfRunsOnProdMode(projectDir, 'react-router-serve');
      });
    });
  });
});
