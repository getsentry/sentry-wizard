import { Outlet } from '@remix-run/react';

export function meta() {
  return [
    { title: 'My App' },
  ];
}

export default function App() {
  return <Outlet />;
}
