import { Outlet } from '@remix-run/react';

export const meta = ({ matches }) => {
  const parentMeta = matches.flatMap((match) => match.meta ?? []);
  return [...parentMeta, { title: 'My App' }];
};

export default function App() {
  return <Outlet />;
}
