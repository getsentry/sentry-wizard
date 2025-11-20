import { Outlet } from 'react-router';

export const ErrorBoundary = ({ error }) => {
  return (
    <div>
      <h1>Something went wrong!</h1>
      <p>{error.message}</p>
    </div>
  );
};

export default function App() {
  return <Outlet />;
}
