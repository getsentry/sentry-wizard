export const ROOT_ROUTE_TEMPLATE_V1 = `import {
    Links,
    LiveReload,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
  } from "@remix-run/react";

  import { withSentry } from "@sentry/remix";

  function App() {
    return (
      <html>
        <head>
          <Meta />
          <Links />
        </head>
        <body>
          <Outlet />
          <ScrollRestoration />
          <Scripts />
          <LiveReload />
        </body>
      </html>
    );
  }

  export default withSentry(App);`;

export const ERROR_BOUNDARY_TEMPLATE_V2 = `const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};`;
