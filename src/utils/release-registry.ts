import axios from 'axios';
import { debug } from './debug';
const registryUrl = 'https://release-registry.services.sentry.io/';

export async function fetchSdkVersion(
  sdk: string,
): Promise<string | undefined> {
    try {
        const data = (
          await axios.get<Record<string, { version: string }>>(`${registryUrl}/sdks`)
        ).data;
        return data[sdk]?.version;
    } catch {
        debug('Failed to fetch latest version from release registry.');
    }
    return undefined;
}
