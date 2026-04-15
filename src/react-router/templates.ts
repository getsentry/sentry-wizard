import { makeCodeSnippet } from '../utils/clack';

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
  useInstrumentationAPI = false,
  useOnError = false,
) => {
  if (useInstrumentationAPI && enableTracing) {
    const integrations = ['tracing'];
    if (enableReplay) {
      integrations.push('Sentry.replayIntegration()');
    }

    const integrationsStr = integrations.join(',\n    ');

    return makeCodeSnippet(true, (unchanged, plus) =>
      unchanged(`${plus("import * as Sentry from '@sentry/react-router';")}
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

${plus(
  `const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });`,
)}

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
  }tracesSampleRate: 1.0, //  Capture 100% of the transactions

  // Set \`tracePropagationTargets\` to declare which URL(s) should have trace propagation enabled
  // In production, replace "yourserver.io" with your actual backend domain
  tracePropagationTargets: [/^\\//, /^https:\\/\\/yourserver\\.io\\/api/],${
    enableReplay
      ? '\n\n  // Capture Replay for 10% of all sessions,\n  // plus 100% of sessions with an error\n  replaysSessionSampleRate: 0.1,\n  replaysOnErrorSampleRate: 1.0,'
      : ''
  }
});`)}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      ${plus(
        `<HydratedRouter${
          useOnError ? ' onError={Sentry.sentryOnError}' : ''
        } unstable_instrumentations={[tracing.clientInstrumentation]} />`,
      )}
    </StrictMode>
  );
});`),
    );
  }

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
      ${plus(
        `<HydratedRouter${
          useOnError ? ' onError={Sentry.sentryOnError}' : ''
        } />`,
      )}
    </StrictMode>
  );
});`),
  );
};

export const getManualServerEntryContent = (useInstrumentationAPI = false) => {
  if (useInstrumentationAPI) {
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

${plus(`// Enable automatic server-side instrumentation for loaders, actions, middleware
export const unstable_instrumentations = [Sentry.createSentryServerInstrumentation()];`)}

// ... rest of your server entry`),
    );
  }

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
    ${plus(`optimizeDeps: {
      exclude: ['@sentry/react-router'],
    },`)}
  };
});`),
  );
};
