import { captureException } from '@sentry/react-router';
import { Outlet } from 'react-router';

export function ErrorBoundary({ error }) {
  if (error && error instanceof Error) {
    captureException(error);
  }

  return (
    <div>
      <h1>Something went wrong!</h1>
      <p>{error.message}</p>
    </div>
  );
}

export default function App() {
  return <Outlet />;
}
