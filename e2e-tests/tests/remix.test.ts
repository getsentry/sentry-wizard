/* eslint-disable jest/expect-expect */
import { Integration } from '../../lib/Constants';
import {
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  cleanupGit,
  createFile,
  KEYS,
  modifyFile,
  revertLocalChanges,
  startWizardInstance,
  TEST_ARGS,
} from '../utils';
import * as path from 'path';

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


async function runWizardOnRemixProject(projectDir: string, integration: Integration, fileModificationFn?: (projectDir: string, integration: Integration) => unknown) {
  const wizardInstance = startWizardInstance(integration, projectDir);
  let packageManagerPrompted = false;

  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);

    await wizardInstance.waitForOutput(
      'Do you want to continue anyway?',
    );

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

  replayOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Do you want to create an example page',
      {
        optional: true,
      },
    ));

  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER, KEYS.ENTER],
    'Sentry has been successfully configured for your Remix project',
  );

  wizardInstance.kill();
};

function checkRemixProject(projectDir: string, integration: Integration, options?: {
  devModeExpectedOutput?: string;
  prodModeExpectedOutput?: string;
}) {
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
      'import * as Sentry from "@sentry/remix";',
      `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,

    integrations: [Sentry.browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches
    }), Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true
    })],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1
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
    autoInstrumentRemix: true
})`,
    ]);
  });

  test('root file contains Sentry ErrorBoundary', () => {
    checkFileContents(`${projectDir}/app/root.tsx`, [
      'import { captureRemixErrorBoundaryError } from "@sentry/remix";',
      `export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};`,
    ]);
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir, 'built');
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, options?.devModeExpectedOutput || 'to expose');
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, options?.prodModeExpectedOutput || '[remix-serve]');
  });
}

describe('Remix', () => {
  describe('with empty project', () => {
    const integration = Integration.remix;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/remix-test-app',
    );

    beforeAll(async () => {
      await runWizardOnRemixProject(projectDir, integration);
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkRemixProject(projectDir, integration);
  });

  describe('with existing custom Express server', () => {
    const integration = Integration.remix;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/remix-test-app',
    );

    beforeAll(async () => {
      await runWizardOnRemixProject(projectDir, integration, (projectDir) => {
        createFile(
          `${projectDir}/server.mjs`,
          SERVER_TEMPLATE,
        );

        modifyFile(`${projectDir}/package.json`, {
          '"start": "remix-serve ./build/server/index.js"': '"start": "node ./server.mjs"',
          '"dev": "remix vite:dev"': '"dev": "node ./server.mjs"',
        });
      });
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkRemixProject(projectDir, integration, {
      devModeExpectedOutput: 'Express server listening',
      prodModeExpectedOutput: 'Express server listening',
    });

    test('server.mjs contains instrumentation file import', () => {
      checkFileContents(`${projectDir}/server.mjs`, [
        "import './instrumentation.server.mjs';",
      ]);
    });
  });
});
