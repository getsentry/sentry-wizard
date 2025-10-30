import { makeCodeSnippet } from '../utils/clack';

function generateErrorBoundaryTemplate(
  isTypeScript: boolean,
  forManualInstructions = false,
): string {
  const typeAnnotations = isTypeScript
    ? { stack: ': string | undefined', props: ': Route.ErrorBoundaryProps' }
    : { stack: '', props: '' };

  const commentLine = forManualInstructions
    ? '// you only want to capture non 404-errors that reach the boundary\n    '
    : '// Only capture non-404 errors (all errors here are already non-RouteErrorResponse)\n    ';

  return `function ErrorBoundary({ error }${typeAnnotations.props}) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack${typeAnnotations.stack};

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    ${commentLine}Sentry.captureException(error);
    details = error.message;
    stack = error.stack;
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
}

export const ERROR_BOUNDARY_TEMPLATE = generateErrorBoundaryTemplate(false);

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

function generateServerInstrumentationCode(
  dsn: string,
  enableTracing: boolean,
  enableProfiling: boolean,
  enableLogs: boolean,
): string {
  return `import * as Sentry from '@sentry/react-router';${
    enableProfiling
      ? `\nimport { nodeProfilingIntegration } from '@sentry/profiling-node';`
      : ''
  }

Sentry.init({
  dsn: "${dsn}",

  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react-router/configuration/options/#sendDefaultPii
  sendDefaultPii: true,${
    enableLogs
      ? '\n\n  // Enable logs to be sent to Sentry\n  enableLogs: true,'
      : ''
  }${enableProfiling ? '\n\n  integrations: [nodeProfilingIntegration()],' : ''}
  tracesSampleRate: ${enableTracing ? '1.0' : '0'}, ${
    enableTracing ? '// Capture 100% of the transactions' : ''
  }${
    enableProfiling
      ? '\n  profilesSampleRate: 1.0, // profile every transaction'
      : ''
  }${
    enableTracing
      ? `

  // Set up performance monitoring
  beforeSend(event) {
    // Filter out 404s from error reporting
    if (event.exception) {
      const error = event.exception.values?.[0];
      if (error?.type === "NotFoundException" || error?.value?.includes("404")) {
        return null;
      }
    }
    return event;
  },`
      : ''
  }
});`;
}

export const getSentryInstrumentationServerContent = (
  dsn: string,
  enableTracing: boolean,
  enableProfiling = false,
  enableLogs = false,
) => {
  return generateServerInstrumentationCode(
    dsn,
    enableTracing,
    enableProfiling,
    enableLogs,
  );
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
    unchanged(`${plus("import * as Sentry from '@sentry/react-router';")}
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

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
    ? '\n\n  // Set `tracePropagationTargets` to declare which URL(s) should have trace propagation enabled\n  // In production, replace "yourserver.io" with your actual backend domain\n  tracePropagationTargets: [/^\\//, /^https:\\/\\/yourserver\\.io\\/api/],'
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

export const getManualHandleRequestContent = () => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    unchanged(`${plus("import * as Sentry from '@sentry/react-router';")}
import { createReadableStreamFromReadable } from '@react-router/node';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';

${plus(`// Replace your existing handleRequest function with this Sentry-wrapped version:
const handleRequest = Sentry.createSentryHandleRequest({
  ServerRouter,
  renderToPipeableStream,
  createReadableStreamFromReadable,
});`)}

${plus(`// If you have a custom handleRequest implementation, wrap it like this:
// export default Sentry.wrapSentryHandleRequest(yourCustomHandleRequest);`)}

export default handleRequest;`),
  );
};

export const getManualRootContent = (isTs: boolean) => {
  const typeAnnotations = isTs
    ? { stack: ': string | undefined', props: ': Route.ErrorBoundaryProps' }
    : { stack: '', props: '' };

  return makeCodeSnippet(true, (unchanged, plus) =>
    unchanged(`${plus("import * as Sentry from '@sentry/react-router';")}

export function ErrorBoundary({ error }${typeAnnotations.props}) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack${typeAnnotations.stack};

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    // you only want to capture non 404-errors that reach the boundary
    ${plus('Sentry.captureException(error);')}
    details = error.message;
    stack = error.stack;
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
  enableLogs = false,
) => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    plus(
      generateServerInstrumentationCode(
        dsn,
        enableTracing,
        enableProfiling,
        enableLogs,
      ),
    ),
  );
};

export const getManualReactRouterConfigContent = (isTS = true) => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    isTS
      ? unchanged(`${plus(
          'import type { Config } from "@react-router/dev/config";',
        )}
${plus("import { sentryOnBuildEnd } from '@sentry/react-router';")}

export default {
  ${plus('ssr: true,')}
  ${plus(`buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
    await sentryOnBuildEnd({ viteConfig, reactRouterConfig, buildManifest });
  },`)}
} satisfies Config;

// If you already have a buildEnd hook, modify it to call sentryOnBuildEnd:
// buildEnd: async (args) => {
//   await yourExistingLogic(args);
//   await sentryOnBuildEnd(args);
// }`)
      : unchanged(`${plus(
          "import { sentryOnBuildEnd } from '@sentry/react-router';",
        )}

export default {
  ${plus('ssr: true,')}
  ${plus(`buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
    await sentryOnBuildEnd({ viteConfig, reactRouterConfig, buildManifest });
  },`)}
};

// If you already have a buildEnd hook, modify it to call sentryOnBuildEnd:
// buildEnd: async (args) => {
//   await yourExistingLogic(args);
//   await sentryOnBuildEnd(args);
// }`),
  );
};

export const getManualViteConfigContent = (
  orgSlug: string,
  projectSlug: string,
) => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    unchanged(`${plus(
      "import { sentryReactRouter } from '@sentry/react-router';",
    )}
import { defineConfig } from 'vite';

export default defineConfig(config => {
  return {
    plugins: [
      // ... your existing plugins
      ${plus(`sentryReactRouter({
        org: "${orgSlug}",
        project: "${projectSlug}",
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }, config),`)}
    ],
  };
});`),
  );
};
