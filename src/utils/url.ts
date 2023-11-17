import { URL } from 'url';

/**
 * Returns the url to the Sentry project stream.
 *
 * Example: https://org-slug.sentry.io/issues/?project=1234567
 */
export function getIssueStreamUrl({
  url,
  orgSlug,
  projectId,
}: {
  url: string;
  orgSlug: string;
  projectId: string;
}): string {
  const urlObject = new URL(url);
  urlObject.host = `${orgSlug}.${urlObject.host}`;
  urlObject.pathname = '/issues/';
  urlObject.searchParams.set('project', projectId);

  return urlObject.toString();
}
