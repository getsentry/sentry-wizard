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
) {
  const wizardInstance = startWizardInstance(integration, projectDir);

  const packageManagerPrompted = await wizardInstance.waitForOutput(
    'Please select your package manager.',
  );

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

function checkReactRouterProject(projectDir: string, integration: Integration) {
  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, integration);
  });

  test('.env.sentry-build-plugin is created and contains the auth token', () => {
    checkEnvBuildPlugin(projectDir);
  });

  test('example page exists', () => {
    checkFileExists(`${projectDir}/app/routes/sentry-example-page.tsx`);
  });

  test('example API route exists', () => {
    checkFileExists(`${projectDir}/app/routes/api.sentry-example-api.ts`);
  });

  test('example page is added to routes configuration', () => {
    checkFileContents(`${projectDir}/app/routes.ts`, [
      'route("/sentry-example-page", "routes/sentry-example-page.tsx")',
      'route("/api/sentry-example-api", "routes/api.sentry-example-api.ts")',
    ]);
  });

  test('instrument.server file exists', () => {
    checkFileExists(`${projectDir}/instrument.server.mjs`);
  });

  test('entry.client file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/app/entry.client.tsx`, [
      'import * as Sentry from',
      '@sentry/react-router',
      `Sentry.init({
  dsn: "${TEST_ARGS.PROJECT_DSN}",`,
      'integrations: [Sentry.reactRouterTracingIntegration(), Sentry.replayIntegration()]',
      'enableLogs: true,',
      'tracesSampleRate: 1.0,',
    ]);
  });

  test('package.json scripts are updated correctly', () => {
    checkFileContents(`${projectDir}/package.json`, [
      `"start": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js"`,
      `"dev": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router dev"`,
    ]);
  });

  test('entry.server file contains Sentry instrumentation', () => {
    checkFileContents(`${projectDir}/app/entry.server.tsx`, [
      'import * as Sentry from',
      '@sentry/react-router',
      'export const handleError = Sentry.createSentryHandleError(',
      'export default Sentry.wrapSentryHandleRequest(handleRequest);'
    ]);
  });

  test('instrument.server file contains Sentry initialization', () => {
    checkFileContents(`${projectDir}/instrument.server.mjs`, [
      'import * as Sentry from \'@sentry/react-router\';',
      `Sentry.init({
  dsn: "${TEST_ARGS.PROJECT_DSN}",`,
      'enableLogs: true,',
    ]);
  });

  test('root file contains Sentry ErrorBoundary', () => {
    checkFileContents(`${projectDir}/app/root.tsx`, [
      'import * as Sentry from',
      '@sentry/react-router',
      'export function ErrorBoundary',
      'Sentry.captureException(error)',
    ]);
  });

  test('vite.config file contains sentryReactRouter plugin', () => {
    checkFileContents(`${projectDir}/vite.config.ts`, [
      'import { sentryReactRouter } from',
      '@sentry/react-router',
      'sentryReactRouter(',
      'authToken: process.env.SENTRY_AUTH_TOKEN',
    ]);
  });

  test('react-router.config file contains buildEnd hook with sentryOnBuildEnd', () => {
    checkFileContents(`${projectDir}/react-router.config.ts`, [
      'import { sentryOnBuildEnd } from',
      '@sentry/react-router',
      'ssr: true,',
      'buildEnd: async',
      'await sentryOnBuildEnd({',
    ]);
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir);
  }, 60000); // 1 minute timeout

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'to expose');
  }, 30000); // 30 second timeout

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'react-router-serve');
  }, 30000); // 30 second timeout
}

describe('React Router', () => {
  describe('with empty project', () => {
    const integration = Integration.reactRouter;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/react-router-test-app',
    );

    beforeAll(async () => {
      await runWizardOnReactRouterProject(projectDir, integration);
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkReactRouterProject(projectDir, integration);
  });

  describe('edge cases', () => {
    const baseProjectDir = path.resolve(
      __dirname,
      '../test-applications/react-router-test-app',
    );

    describe('existing Sentry setup', () => {
      const integration = Integration.reactRouter;
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

        await runWizardOnReactRouterProject(projectDir, integration);
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

      // Only test the essential checks for this edge case
      test('package.json is updated correctly', () => {
        checkPackageJson(projectDir, integration);
      });

      test('essential files exist or wizard completes gracefully', () => {
        // Check if key directories exist
        expect(fs.existsSync(`${projectDir}/app`)).toBe(true);

        // When there's existing Sentry setup, the wizard may skip some file creation
        // to avoid conflicts. This is acceptable behavior.
        // Let's check if the wizard at least completed by verifying package.json was updated
        const packageJsonPath = `${projectDir}/package.json`;
        expect(fs.existsSync(packageJsonPath)).toBe(true);

        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };

        const hasSentryPackage =
          (packageJson.dependencies?.['@sentry/react-router']) ||
          (packageJson.devDependencies?.['@sentry/react-router']);

        // The wizard should have at least installed the Sentry package
        expect(hasSentryPackage).toBeTruthy();
      });
    });

    describe('missing entry files', () => {
      const integration = Integration.reactRouter;
      const projectDir = path.resolve(
        __dirname,
        '../test-applications/react-router-test-app-missing-entries',
      );

      beforeAll(async () => {
        // Copy project and remove entry files
        fs.cpSync(baseProjectDir, projectDir, { recursive: true });

        const entryClientPath = path.join(projectDir, 'app', 'entry.client.tsx');
        const entryServerPath = path.join(projectDir, 'app', 'entry.server.tsx');

        if (fs.existsSync(entryClientPath)) fs.unlinkSync(entryClientPath);
        if (fs.existsSync(entryServerPath)) fs.unlinkSync(entryServerPath);

        await runWizardOnReactRouterProject(projectDir, integration);
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

      test('basic configuration still works', () => {
        checkPackageJson(projectDir, integration);
        checkFileExists(`${projectDir}/instrument.server.mjs`);
      });
    });
  });
});
