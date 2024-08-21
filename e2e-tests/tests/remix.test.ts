import type { Integration } from '../../lib/Constants';
import {
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  checkSentryCliRc,
  TEST_ARGS,
} from '../utils';

export async function run(projectDir: string, integration: Integration) {
  checkPackageJson(projectDir, integration);
  checkSentryCliRc(projectDir);

  checkFileExists(`${projectDir}/app/routes/sentry-example-page.tsx`);
  checkFileExists(`${projectDir}/instrumentation.server.mjs`);

  checkFileContents(`${projectDir}/app/entry.client.tsx`, [
    'import * as Sentry from "@sentry/remix";',
    `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,

    integrations: [Sentry.browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches
    }), Sentry.replayIntegration()]
})
`,
  ]);

  checkFileContents(`${projectDir}/app/entry.server.tsx`, [
    'import * as Sentry from "@sentry/remix";',
    `export const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  // Custom handleError implementation
});`,
  ]);

  checkFileContents(`${projectDir}/instrumentation.server.mjs`, [
    'import * as Sentry from "@sentry/remix";',
    `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    autoInstrumentRemix: true
})`,
  ]);

  checkFileContents(`${projectDir}/app/root.tsx`, [
    'import { captureRemixErrorBoundaryError } from "@sentry/remix";',
    `export const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};`,
  ]);

  await checkIfBuilds(projectDir);
  await checkIfRunsOnProdMode(projectDir, '[remix-serve]');
  await checkIfRunsOnDevMode(projectDir, /to expose/);
  // await checkIfRunsOnProdMode(projectDir);
  // await checkIfRunsOnDevMode(projectDir);
}
