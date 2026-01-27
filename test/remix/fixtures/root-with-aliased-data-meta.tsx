import type { MetaFunction } from '@remix-run/node';

export const meta: MetaFunction = ({ data: loaderData }) => [
  { title: loaderData?.title || 'My App' },
];

export default function Root() {
  return <div>Root</div>;
}
