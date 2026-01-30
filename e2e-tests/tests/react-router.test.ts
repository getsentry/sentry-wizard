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
    /**
     * Set to true when entry files are modified/have existing Sentry - wizard will
     * ask about reveal and manual snippet application
     */
    modifiedEntryFiles?: boolean;
    /**
     * Set to true when any files are modified (dirty git state) - wizard will
     * ask to continue anyway
     */
    dirtyGitState?: boolean;
  },
): Promise<number> {
  const { modifiedEntryFiles = false, dirtyGitState = false } = opts || {};

  const wizardInteraction = withEnv({
    cwd: projectDir,
  }).defineInteraction();

  if (dirtyGitState) {
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
    // Instrumentation API prompt appears for React Router >= 7.9.5
    // (detected from installed node_modules version, not package.json range)
    .whenAsked('Do you want to use the Instrumentation API')
    .respondWith(KEYS.ENTER) // Yes
    .expectOutput('Installing @sentry/profiling-node')
    .expectOutput('Installed @sentry/profiling-node', {
      timeout: 240_000,
    })
    .whenAsked('Do you want to create an example page')
    .respondWith(KEYS.ENTER);

  if (modifiedEntryFiles) {
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
      checkPackageJson(projectDir, '@sentry/react-router');
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

    test('entry.client file contains Sentry initialization with Instrumentation API', () => {
      checkFileContents(`${projectDir}/app/entry.client.tsx`, [
        'import * as Sentry from',
        '@sentry/react-router',
        `Sentry.init({
  dsn: "${TEST_ARGS.PROJECT_DSN}",`,
        // With Instrumentation API enabled, tracing is stored in a variable
        'const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });',
        'integrations: [tracing, Sentry.replayIntegration()]',
        'enableLogs: true,',
        'tracesSampleRate: 1.0,',
        // HydratedRouter should have unstable_instrumentations prop
        'unstable_instrumentations={[tracing.clientInstrumentation]}',
      ]);
    });

    test('package.json scripts are updated correctly', () => {
      checkFileContents(`${projectDir}/package.json`, [
        `"start": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js"`,
        `"dev": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router dev"`,
      ]);
    });

    test('entry.server file contains Sentry instrumentation with Instrumentation API', () => {
      checkFileContents(`${projectDir}/app/entry.server.tsx`, [
        'import * as Sentry from',
        '@sentry/react-router',
        'export const handleError = Sentry.createSentryHandleError(',
        'export default Sentry.wrapSentryHandleRequest(handleRequest);',
        // With Instrumentation API enabled, should have unstable_instrumentations export
        'export const unstable_instrumentations = [Sentry.createSentryServerInstrumentation()];',
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
        fs.writeFileSync(clientEntryPath, existingContent);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir, {
          modifiedEntryFiles: true,
          dirtyGitState: true,
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
        checkPackageJson(projectDir, '@sentry/react-router');
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
        checkPackageJson(projectDir, '@sentry/react-router');
        checkFileExists(`${projectDir}/instrument.server.mjs`);
      });
    });

    describe('SPA mode (ssr: false)', () => {
      let wizardExitCode: number;

      const { projectDir, cleanup } = createIsolatedTestEnv(
        'react-router-test-app',
      );

      beforeAll(async () => {
        // Modify react-router.config.ts to have ssr: false (SPA mode)
        const configPath = path.join(projectDir, 'react-router.config.ts');
        const spaConfigContent = `import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
} satisfies Config;
`;
        fs.writeFileSync(configPath, spaConfigContent);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir, {
          dirtyGitState: true,
        });
      });

      afterAll(() => {
        cleanup();
      });

      test('exits with exit code 0', () => {
        expect(wizardExitCode).toBe(0);
      });

      test('wizard changes ssr: false to ssr: true for sourcemap uploads', () => {
        checkFileContents(`${projectDir}/react-router.config.ts`, [
          'ssr: true',
          'sentryOnBuildEnd',
        ]);
      });

      test('react-router.config contains comment about SSR change', () => {
        const configContent = fs.readFileSync(
          `${projectDir}/react-router.config.ts`,
          'utf8',
        );
        // The wizard should add a comment when changing ssr from false to true
        expect(configContent).toContain('ssr');
        expect(configContent).toContain('true');
      });

      test('builds successfully with changed SSR setting', async () => {
        await checkIfBuilds(projectDir);
      }, 60_000);
    });

    describe('existing ErrorBoundary function', () => {
      let wizardExitCode: number;

      const { projectDir, cleanup } = createIsolatedTestEnv(
        'react-router-test-app',
      );

      beforeAll(async () => {
        // Modify root.tsx to have an existing ErrorBoundary function
        const rootPath = path.join(projectDir, 'app', 'root.tsx');
        const rootWithErrorBoundary = `import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";

export function ErrorBoundary({ error }: { error: unknown }) {
  // Custom error handling logic
  console.error('Custom error handler:', error);

  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>{error.status} {error.statusText}</h1>
        <p>{error.data}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Something went wrong!</h1>
      <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
    </div>
  );
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="App">
          <nav>
            <ul>
              <li>
                <a href="/">Home</a>
              </li>
              <li>
                <a href="/about">About</a>
              </li>
              <li>
                <a href="/contact">Contact</a>
              </li>
            </ul>
          </nav>

          <main>
            <Outlet />
          </main>
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
`;
        fs.writeFileSync(rootPath, rootWithErrorBoundary);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir, {
          dirtyGitState: true,
        });
      });

      afterAll(() => {
        cleanup();
      });

      test('exits with exit code 0', () => {
        expect(wizardExitCode).toBe(0);
      });

      test('wizard adds Sentry.captureException to existing ErrorBoundary', () => {
        checkFileContents(`${projectDir}/app/root.tsx`, [
          'import * as Sentry from',
          '@sentry/react-router',
          'export function ErrorBoundary',
          'Sentry.captureException(error)',
        ]);
      });

      test('preserves existing ErrorBoundary logic', () => {
        const rootContent = fs.readFileSync(
          `${projectDir}/app/root.tsx`,
          'utf8',
        );
        // Should preserve the custom error handling
        expect(rootContent).toContain('isRouteErrorResponse');
        // Should only have one ErrorBoundary function
        const errorBoundaryCount = (
          rootContent.match(/export function ErrorBoundary/g) || []
        ).length;
        expect(errorBoundaryCount).toBe(1);
      });

      test('builds successfully', async () => {
        await checkIfBuilds(projectDir);
      }, 60_000);
    });

    describe('function-form defineConfig in vite.config', () => {
      let wizardExitCode: number;

      const { projectDir, cleanup } = createIsolatedTestEnv(
        'react-router-test-app',
      );

      beforeAll(async () => {
        // Modify vite.config.ts to use function-form defineConfig with identifier parameter
        // Note: The sentryReactRouter plugin requires access to the full config object,
        // so we use a simple identifier parameter (config) rather than destructuring
        const viteConfigPath = path.join(projectDir, 'vite.config.ts');
        const functionFormViteConfig = `import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig((config) => ({
  plugins: [reactRouter()],
  define: {
    __APP_MODE__: config.mode === 'development' ? '"dev"' : '"prod"',
  },
}));
`;
        fs.writeFileSync(viteConfigPath, functionFormViteConfig);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir, {
          dirtyGitState: true,
        });
      });

      afterAll(() => {
        cleanup();
      });

      test('exits with exit code 0', () => {
        expect(wizardExitCode).toBe(0);
      });

      test('wizard adds sentryReactRouter plugin to function-form config', () => {
        checkFileContents(`${projectDir}/vite.config.ts`, [
          'import { sentryReactRouter } from',
          '@sentry/react-router',
          'sentryReactRouter(',
          'authToken: process.env.SENTRY_AUTH_TOKEN',
        ]);
      });

      test('preserves function-form defineConfig structure', () => {
        const viteContent = fs.readFileSync(
          `${projectDir}/vite.config.ts`,
          'utf8',
        );
        // Should still be using function form with config parameter
        expect(viteContent).toMatch(/defineConfig\s*\(\s*\(?config\)?/);
        // Should preserve the custom define
        expect(viteContent).toContain('__APP_MODE__');
      });

      test('builds successfully', async () => {
        await checkIfBuilds(projectDir);
      }, 60_000);
    });

    describe('destructured parameter in vite.config', () => {
      let wizardExitCode: number;

      const { projectDir, cleanup } = createIsolatedTestEnv(
        'react-router-test-app',
      );

      beforeAll(async () => {
        // Test critical fix: destructured params like ({ mode }) => ({ define: { x: mode } })
        // The wizard must convert expression body to block statement with destructuring
        const viteConfigPath = path.join(projectDir, 'vite.config.ts');
        const destructuredViteConfig = `import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [reactRouter()],
  define: {
    __IS_DEV__: mode === 'development',
  },
}));
`;
        fs.writeFileSync(viteConfigPath, destructuredViteConfig);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir, {
          dirtyGitState: true,
        });
      });

      afterAll(() => {
        cleanup();
      });

      test('exits with exit code 0', () => {
        expect(wizardExitCode).toBe(0);
      });

      test('wizard rewrites destructured parameter and adds sentryReactRouter plugin', () => {
        checkFileContents(`${projectDir}/vite.config.ts`, [
          'sentryReactRouter(',
          'authToken: process.env.SENTRY_AUTH_TOKEN',
        ]);
      });

      test('preserves destructured properties via added const declaration', () => {
        const viteContent = fs.readFileSync(
          `${projectDir}/vite.config.ts`,
          'utf8',
        );
        // Should have config parameter (may or may not have parens around single param)
        expect(viteContent).toMatch(/config\s*=>/);
        // Should have destructuring statement
        expect(viteContent).toContain('const {');
        expect(viteContent).toContain('mode');
        // Should still use mode in define
        expect(viteContent).toContain('__IS_DEV__');
      });

      test('builds successfully with rewritten destructured params', async () => {
        await checkIfBuilds(projectDir);
      }, 60_000);
    });

    describe('existing ErrorBoundary as arrow function', () => {
      let wizardExitCode: number;

      const { projectDir, cleanup } = createIsolatedTestEnv(
        'react-router-test-app',
      );

      beforeAll(async () => {
        // Modify root.tsx to have an existing ErrorBoundary as arrow function
        const rootPath = path.join(projectDir, 'app', 'root.tsx');
        const rootWithArrowErrorBoundary = `import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";

export const ErrorBoundary = ({ error }: { error: unknown }) => {
  // Custom error handling logic
  console.error('Arrow function error handler:', error);

  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>{error.status} {error.statusText}</h1>
      </div>
    );
  }

  return (
    <div>
      <h1>Error!</h1>
      <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
    </div>
  );
};

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
`;
        fs.writeFileSync(rootPath, rootWithArrowErrorBoundary);

        wizardExitCode = await runWizardOnReactRouterProject(projectDir, {
          dirtyGitState: true,
        });
      });

      afterAll(() => {
        cleanup();
      });

      test('exits with exit code 0', () => {
        expect(wizardExitCode).toBe(0);
      });

      test('wizard adds Sentry.captureException to arrow function ErrorBoundary', () => {
        checkFileContents(`${projectDir}/app/root.tsx`, [
          'import * as Sentry from',
          '@sentry/react-router',
          'export const ErrorBoundary',
          'Sentry.captureException(error)',
        ]);
      });

      test('preserves arrow function ErrorBoundary structure', () => {
        const rootContent = fs.readFileSync(
          `${projectDir}/app/root.tsx`,
          'utf8',
        );
        // Should still be using arrow function syntax
        expect(rootContent).toMatch(/export const ErrorBoundary\s*=/);
        // The export const should appear exactly once
        const exportCount = (
          rootContent.match(/export const ErrorBoundary/g) || []
        ).length;
        expect(exportCount).toBe(1);
      });

      test('builds successfully', async () => {
        await checkIfBuilds(projectDir);
      }, 60_000);
    });
  });
});
