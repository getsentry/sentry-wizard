import { Outlet } from 'react-router';

function ErrorBoundary({ error }) {
  return (
    <div>
      <h1>Something went wrong!</h1>
      <p>{error.message}</p>
    </div>
  );
}

export { ErrorBoundary };

export default function App() {
  return <Outlet />;
}
