import * as Sentry from '@sentry/react-router';
import { Outlet, isRouteErrorResponse } from 'react-router';

export function ErrorBoundary({ error }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    // you only want to capture non 404-errors that reach the boundary
    Sentry.captureException(error);
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{error.message}</p>
      {stack && (
        <pre>
          <code>{error.stack}</code>
        </pre>
      )}
    </main>
  );
}

export default function App() {
  return <Outlet />;
}
