import { Outlet } from '@remix-run/react';

export const meta = ({ data }) => [
  { name: 'sentry-trace', content: data && data.sentryTrace },
  { name: 'baggage', content: data && data.sentryBaggage },
  { title: 'My App' },
];

export default function App() {
  return <Outlet />;
}
