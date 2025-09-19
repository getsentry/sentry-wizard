import { Outlet } from 'react-router';

const ErrorBoundary = function({ error }) {
  return (
    <div>
      <h1>Something went wrong!</h1>
      <p>{error.message}</p>
    </div>
  );
};

export { ErrorBoundary };

export default function App() {
  return <Outlet />;
}
