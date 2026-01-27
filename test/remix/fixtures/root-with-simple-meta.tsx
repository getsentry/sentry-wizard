import { Outlet } from '@remix-run/react';

export const meta = () => [
  { title: 'My App' },
  { name: 'description', content: 'A great app' },
];

export default function App() {
  return <Outlet />;
}
