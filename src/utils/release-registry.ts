import { debug } from './debug';
const registryUrl = 'https://release-registry.services.sentry.io/';

export async function fetchSdkVersion(
  sdk: string,
): Promise<string | undefined> {
  try {
    const fetch = await import('node-fetch').then((m) => m.default);
    const response = await fetch(`${registryUrl}/sdks`);
    const data = (await response.json()) as Record<
      string,
      { version: string } | undefined
    >;
    return data && data[sdk]?.version;
  } catch {
    debug('Failed to fetch latest version from release registry.');
  }
  return undefined;
}
