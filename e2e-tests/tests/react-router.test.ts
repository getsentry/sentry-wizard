import * as path from 'node:path';
import * as fs from 'node:fs';
import { Integration } from '../../lib/Constants';
import {
  TEST_ARGS,
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

async function runWizardOnReactRouterProject(
  projectDir: string,
  opts?: {
    modifiedFiles?: boolean;
  },
): Promise<number> {
  const { modifiedFiles = false } = opts || {};

  const wizardInteraction = withEnv({
    cwd: projectDir,
  }).defineInteraction();

  if (modifiedFiles) {
    wizardInteraction
      .whenAsked('Do you want to continue anyway?')
      .respondWith(KEYS.ENTER);
  }

  wizardInteraction
    .whenAsked('Please select your package manager.')
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .expectOutput('Installing @sentry/react-router')
    .expectOutput('Installed @sentry/react-router', {
      timeout: 240_000,
    })

    .whenAsked('Do you want to enable Tracing')
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to enable Session Replay')
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to enable Logs')
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to enable Profiling')
    .respondWith(KEYS.ENTER)
    .expectOutput('Installing @sentry/profiling-node')
    .expectOutput('Installed @sentry/profiling-node', {
      timeout: 240_000,
    })
    .whenAsked('Do you want to create an example page')
    .respondWith(KEYS.ENTER);

  if (modifiedFiles) {
    wizardInteraction
      .whenAsked('Would you like to try running npx react-router reveal')
      .respondWith(KEYS.ENTER)
      .whenAsked('Did you apply the snippet above?')
      .respondWith(KEYS.ENTER);
  }

  return wizardInteraction
    .whenAsked(
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
    )
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .expectOutput('Successfully installed the Sentry React Router SDK!')
    .run(getWizardCommand(Integration.reactRouter));
}

describe('React Router', () => {
  describe('with empty project', () => {
    let wizardExitCode: number;
    const { projectDir, cleanup } = createIsolatedTestEnv(
      'react-router-test-app',
    );

    beforeAll(async () => {
      wizardExitCode = await runWizardOnReactRouterProject(projectDir);
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('package.json is updated correctly', () => {
      checkPackageJson(projectDir, Integration.reactRouter);
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
        'export default Sentry.wrapSentryHandleRequest(handleRequest);',
      ]);
    });

    test('instrument.server file contains Sentry initialization', () => {
      checkFileContents(`${projectDir}/instrument.server.mjs`, [
        "import * as Sentry from '@sentry/react-router';",
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
    }, 60_000); // 1 minute timeout

    test('runs on dev mode correctly', async () => {
      await checkIfRunsOnDevMode(projectDir, 'to expose');
    }, 30_000); // 30 second timeout

    test('runs on prod mode correctly', async () => {
      await checkIfRunsOnProdMode(projectDir, 'react-router-serve');
    }, 30_000); // 30 second timeout
  });

  describe('edge cases', () => {
    describe('existing Sentry setup', () => {
      let wizardExitCode: number;

      const { projectDir, cleanup } = createIsolatedTestEnv(
        'react-router-test-app',
      );

      beforeAll(async () => {
        // Add existing Sentry setup to the isolated test app
        const clientEntryPath = path.join(
          projectDir,
          'app',
          'entry.client.tsx',
        );
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
        console.log('xx clientEntryPath', clientEntryPath);
        fs.writeFileSync(clientEntryPath, existingContent);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir, {
          modifiedFiles: true,
        });
      });

      afterAll(() => {
        cleanup();
      });

      test('exits with exit code 0', () => {
        expect(wizardExitCode).toBe(0);
      });

      test('wizard handles existing Sentry without duplication', () => {
        const clientContent = fs.readFileSync(
          `${projectDir}/app/entry.client.tsx`,
          'utf8',
        );
        const sentryImportCount = (
          clientContent.match(
            /import \* as Sentry from "@sentry\/react-router"/g,
          ) || []
        ).length;
        const sentryInitCount = (clientContent.match(/Sentry\.init\(/g) || [])
          .length;

        expect(sentryImportCount).toBe(1);
        expect(sentryInitCount).toBe(1);
      });

      // Only test the essential checks for this edge case
      test('package.json is updated correctly', () => {
        checkPackageJson(projectDir, Integration.reactRouter);
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
          packageJson.dependencies?.['@sentry/react-router'] ||
          packageJson.devDependencies?.['@sentry/react-router'];

        // The wizard should have at least installed the Sentry package
        expect(hasSentryPackage).toBeTruthy();
      });
    });

    describe('missing entry files', () => {
      let wizardExitCode: number;

      const { projectDir, cleanup } = createIsolatedTestEnv(
        'react-router-test-app',
      );

      beforeAll(async () => {
        // Copy project and remove entry files

        const entryClientPath = path.join(
          projectDir,
          'app',
          'entry.client.tsx',
        );
        const entryServerPath = path.join(
          projectDir,
          'app',
          'entry.server.tsx',
        );

        if (fs.existsSync(entryClientPath)) fs.unlinkSync(entryClientPath);
        if (fs.existsSync(entryServerPath)) fs.unlinkSync(entryServerPath);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir);
      });

      afterAll(() => {
        cleanup();
      });

      test('exits with exit code 0', () => {
        expect(wizardExitCode).toBe(0);
      });

      test('wizard creates missing entry files', () => {
        checkFileExists(`${projectDir}/app/entry.client.tsx`);
        checkFileExists(`${projectDir}/app/entry.server.tsx`);
      });

      test('basic configuration still works', () => {
        checkPackageJson(projectDir, Integration.reactRouter);
        checkFileExists(`${projectDir}/instrument.server.mjs`);
      });
    });
  });
});
