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
  createFile,
  createIsolatedTestEnv,
  getWizardCommand,
  modifyFile,
} from '../utils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

const SERVER_TEMPLATE = `import { createRequestHandler } from '@remix-run/express';
import { installGlobals } from '@remix-run/node';
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';

installGlobals();

const viteDevServer =
  process.env.NODE_ENV === 'production'
    ? undefined
    : await import('vite').then(vite =>
        vite.createServer({
          server: { middlewareMode: true },
        }),
      );

const app = express();

app.use(compression());
app.disable('x-powered-by');

if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  app.use('/assets', express.static('build/client/assets', { immutable: true, maxAge: '1y' }));
}

app.use(express.static('build/client', { maxAge: '1h' }));
app.use(morgan('tiny'));

app.all(
  '*',
  createRequestHandler({
    build: viteDevServer
      ? () => viteDevServer.ssrLoadModule('virtual:remix/server-build')
      : await import('./build/server/index.js'),
  }),
);

app.listen(0, () => console.log('Express server listening'));
`;

async function runWizardOnRemixProject(
  projectDir: string,
  integration: Integration,
  fileModificationFn?: (
    projectDir: string,
    integration: Integration,
  ) => unknown,
): Promise<number> {
  const wizardInteraction = withEnv({
    cwd: projectDir,
  }).defineInteraction();

  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);

    wizardInteraction
      .whenAsked('Do you want to continue anyway?')
      .respondWith(KEYS.ENTER);
  }

  return wizardInteraction
    .whenAsked('Please select your package manager.')
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .whenAsked('to track the performance of your application?', {
      timeout: 240_000, // package installation can take a while in CI
    })
    .respondWith(KEYS.ENTER)
    .whenAsked(
      'to get a video-like reproduction of errors during a user session?',
    )
    .respondWith(KEYS.ENTER)
    .whenAsked('to send your application logs to Sentry?')
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to create an example page')
    .respondWith(KEYS.ENTER)
    .whenAsked(
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
    )
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .expectOutput(
      'Sentry has been successfully configured for your Remix project',
    )
    .run(getWizardCommand(integration));
}

describe('Remix', () => {
  describe('with empty project', () => {
    const integration = Integration.remix;
    let wizardExitCode: number;

    const { projectDir, cleanup } = createIsolatedTestEnv('remix-test-app');

    beforeAll(async () => {
      wizardExitCode = await runWizardOnRemixProject(projectDir, integration);
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('package.json is updated correctly', () => {
      checkPackageJson(projectDir, integration);
    });

    test('.env-sentry-build-plugin is created and contains the auth token', () => {
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
        'import { init, replayIntegration, browserTracingIntegration } from "@sentry/remix";',
        `init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    enableLogs: true,

    integrations: [browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches
    }), replayIntegration({
        maskAllText: true,
        blockAllMedia: true
    })],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    sendDefaultPii: true
})`,
      ]);
    });

    test('entry.server file contains Sentry code', () => {
      checkFileContents(`${projectDir}/app/entry.server.tsx`, [
        'import * as Sentry from "@sentry/remix";',
        `export const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  // Custom handleError implementation
});`,
      ]);
    });

    test('instrumentation.server file contains Sentry initialization', () => {
      checkFileContents(`${projectDir}/instrumentation.server.mjs`, [
        'import * as Sentry from "@sentry/remix";',
        `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    enableLogs: true
})`,
      ]);
    });

    test('root file contains Sentry ErrorBoundary and withSentry wrapper', () => {
      checkFileContents(`${projectDir}/app/root.tsx`, [
        'import { captureRemixErrorBoundaryError, withSentry } from "@sentry/remix";',
        `export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};`,
        `export default withSentry(App);`,
      ]);
    });

    test('builds successfully', async () => {
      await checkIfBuilds(projectDir);
    });

    test('runs on dev mode correctly', async () => {
      await checkIfRunsOnDevMode(projectDir, 'to expose');
    });

    test('runs on prod mode correctly', async () => {
      await checkIfRunsOnProdMode(projectDir, '[remix-serve]');
    });
  });

  describe('with existing custom Express server', () => {
    const integration = Integration.remix;
    let wizardExitCode: number;

    const { projectDir, cleanup } = createIsolatedTestEnv('remix-test-app');

    beforeAll(async () => {
      wizardExitCode = await runWizardOnRemixProject(
        projectDir,
        integration,
        (projectDir) => {
          createFile(`${projectDir}/server.mjs`, SERVER_TEMPLATE);

          modifyFile(`${projectDir}/package.json`, {
            '"start": "remix-serve ./build/server/index.js"':
              '"start": "node ./server.mjs"',
            '"dev": "remix vite:dev"': '"dev": "node ./server.mjs"',
          });
        },
      );
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('package.json is updated correctly', () => {
      checkPackageJson(projectDir, integration);
    });

    test('.env-sentry-build-plugin is created and contains the auth token', () => {
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
        'import { init, replayIntegration, browserTracingIntegration } from "@sentry/remix";',
        `init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    enableLogs: true,

    integrations: [browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches
    }), replayIntegration({
        maskAllText: true,
        blockAllMedia: true
    })],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    sendDefaultPii: true
})`,
      ]);
    });

    test('entry.server file contains Sentry code', () => {
      checkFileContents(`${projectDir}/app/entry.server.tsx`, [
        'import * as Sentry from "@sentry/remix";',
        `export const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  // Custom handleError implementation
});`,
      ]);
    });

    test('instrumentation.server file contains Sentry initialization', () => {
      checkFileContents(`${projectDir}/instrumentation.server.mjs`, [
        'import * as Sentry from "@sentry/remix";',
        `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    enableLogs: true
})`,
      ]);
    });

    test('root file contains Sentry ErrorBoundary and withSentry wrapper', () => {
      checkFileContents(`${projectDir}/app/root.tsx`, [
        'import { captureRemixErrorBoundaryError, withSentry } from "@sentry/remix";',
        `export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};`,
        `export default withSentry(App);`,
      ]);
    });

    test('builds successfully', async () => {
      await checkIfBuilds(projectDir);
    });

    test('runs on dev mode correctly', async () => {
      await checkIfRunsOnDevMode(projectDir, 'Express server listening');
    });

    test('runs on prod mode correctly', async () => {
      await checkIfRunsOnProdMode(projectDir, 'Express server listening');
    });

    test('server.mjs contains instrumentation file import', () => {
      checkFileContents(`${projectDir}/server.mjs`, [
        "import './instrumentation.server.mjs';",
      ]);
    });
  });
});
