import { Outlet } from '@remix-run/react';

export const meta = ({ data }) => [
  { title: data && data.title || 'My App' },
];

export default function App() {
  return <Outlet />;
}
