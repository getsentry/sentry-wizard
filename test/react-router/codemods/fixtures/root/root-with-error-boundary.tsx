import { Outlet, useRouteError } from 'react-router';

export default function RootLayout() {
  return (
    <html>
      <head>
        <title>React Router App</title>
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <div>
      <h1>Something went wrong!</h1>
      <p>{error?.message || 'An unexpected error occurred'}</p>
    </div>
  );
}
