export const ERROR_BOUNDARY_TEMPLATE = `import { isRouteErrorResponse } from "react-router";
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
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
    integrations.push(
      'reactRouterTracingIntegration({\n      useEffect,\n      useLocation,\n      useNavigate\n    })',
    );
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
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

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
