import { Outlet } from '@remix-run/react';

export const meta = () => {
  return [
    { title: 'My App' },
  ];
};

export default function App() {
  return <Outlet />;
}
