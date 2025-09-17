import { makeCodeSnippet } from '../utils/clack';

export const ERROR_BOUNDARY_TEMPLATE = `export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    // you only want to capture non 404-errors that reach the boundary
    Sentry.captureException(error);
    if (import.meta.env.DEV) {
      details = error.message;
      stack = error.stack;
    }
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}`;

export const EXAMPLE_PAGE_TEMPLATE_TSX = `import type { Route } from "./+types/sentry-example-page";

export async function loader() {
  throw new Error("some error thrown in a loader");
}

export default function SentryExamplePage() {
  return <div>Loading this page will throw an error</div>;
}`;

export const EXAMPLE_PAGE_TEMPLATE_JSX = `export async function loader() {
  throw new Error("some error thrown in a loader");
}

export default function SentryExamplePage() {
  return <div>Loading this page will throw an error</div>;
}`;

export const SENTRY_INIT_SERVER_CONTENT = `import * as Sentry from "@sentry/react-router";
import { type HandleErrorFunction } from "react-router";

export const handleError: HandleErrorFunction = (error, { request }) => {
  // React Router may abort some interrupted requests, report those
  if (!request.signal.aborted) {
    Sentry.captureException(error);
    console.error(error);
  }
};`;

export const getSentryInitClientContent = (
  dsn: string,
  enableTracing: boolean,
  enableReplay: boolean,
  enableLogs: boolean,
) => {
  const integrations = [];

  if (enableTracing) {
    integrations.push('reactRouterTracingIntegration()');
  }

  if (enableReplay) {
    integrations.push(
      'replayIntegration({\n        maskAllText: true,\n        blockAllMedia: true\n    })',
    );
  }

  const integrationsStr =
    integrations.length > 0 ? integrations.join(', ') : '';

  return `import { init${enableReplay ? ', replayIntegration' : ''}${
    enableTracing ? ', reactRouterTracingIntegration' : ''
  } } from "@sentry/react-router";

init({
    dsn: "${dsn}",
    tracesSampleRate: ${enableTracing ? '1' : '0'},${
    enableLogs ? '\n    enableLogs: true,' : ''
  }

    integrations: [${integrationsStr}],${
    enableReplay
      ? '\n\n    replaysSessionSampleRate: 0.1,\n    replaysOnErrorSampleRate: 1'
      : ''
  }
});`;
};

export const getSentryInstrumentationServerContent = (
  dsn: string,
  enableTracing: boolean,
) => {
  return `import * as Sentry from "@sentry/react-router";

Sentry.init({
    dsn: "${dsn}",
    tracesSampleRate: ${enableTracing ? '1' : '0'},
    enableLogs: true
});`;
};

export const getManualClientEntryContent = (
  dsn: string,
  enableTracing: boolean,
  enableReplay: boolean,
  enableLogs: boolean,
) => {
  const integrations = [];

  if (enableTracing) {
    integrations.push('Sentry.reactRouterTracingIntegration()');
  }

  if (enableReplay) {
    integrations.push('Sentry.replayIntegration()');
  }

  const integrationsStr =
    integrations.length > 0 ? integrations.join(',\n    ') : '';

  return makeCodeSnippet(true, (unchanged, plus) =>
    unchanged(`${plus('import * as Sentry from "@sentry/react-router";')}
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

${plus(`Sentry.init({
  dsn: "${dsn}",

  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react-router/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  integrations: [
    ${integrationsStr}
  ],

  ${
    enableLogs
      ? '// Enable logs to be sent to Sentry\n  enableLogs: true,\n\n  '
      : ''
  }tracesSampleRate: ${enableTracing ? '1.0' : '0'},${
  enableTracing ? ' //  Capture 100% of the transactions' : ''
}${
  enableTracing
    ? '\n\n  // Set `tracePropagationTargets` to declare which URL(s) should have trace propagation enabled\n  tracePropagationTargets: [/^\\//, /^https:\\/\\/yourserver\\.io\\/api/],'
    : ''
}${
  enableReplay
    ? '\n\n  // Capture Replay for 10% of all sessions,\n  // plus 100% of sessions with an error\n  replaysSessionSampleRate: 0.1,\n  replaysOnErrorSampleRate: 1.0,'
    : ''
}
});`)}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});`),
  );
};

export const getManualServerEntryContent = () => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    unchanged(`${plus("import * as Sentry from '@sentry/react-router';")}
import { createReadableStreamFromReadable } from '@react-router/node';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';

${plus(`const handleRequest = Sentry.createSentryHandleRequest({
  ServerRouter,
  renderToPipeableStream,
  createReadableStreamFromReadable,
});`)}

export default handleRequest;

${plus(`export const handleError = Sentry.createSentryHandleError({
  logErrors: false
});`)}

// ... rest of your server entry`),
  );
};

export const getManualRootContent = (isTs: boolean) => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    unchanged(`${plus('import * as Sentry from "@sentry/react-router";')}

export function ErrorBoundary({ error }${
      isTs ? ': Route.ErrorBoundaryProps' : ''
    }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack${isTs ? ': string | undefined' : ''};

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    // you only want to capture non 404-errors that reach the boundary
    ${plus('Sentry.captureException(error);')}
    if (import.meta.env.DEV) {
      details = error.message;
      stack = error.stack;
    }
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
// ...`),
  );
};

export const getManualServerInstrumentContent = (
  dsn: string,
  enableTracing: boolean,
  enableProfiling: boolean,
) => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    plus(`import * as Sentry from "@sentry/react-router";${
      enableProfiling
        ? `\nimport { nodeProfilingIntegration } from "@sentry/profiling-node";`
        : ''
    }

Sentry.init({
  dsn: "${dsn}",

  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react-router/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Enable logs to be sent to Sentry
  enableLogs: true,${
    enableProfiling ? '\n\n  integrations: [nodeProfilingIntegration()],' : ''
  }
  tracesSampleRate: ${enableTracing ? '1.0' : '0'}, ${
      enableTracing ? '// Capture 100% of the transactions' : ''
    }${
      enableProfiling
        ? '\n  profilesSampleRate: 1.0, // profile every transaction'
        : ''
    }
});`),
  );
};
