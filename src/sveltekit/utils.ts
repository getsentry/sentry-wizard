import { gte, lt, minVersion } from 'semver';
import { getPackageVersion } from '../utils/package-json';
import { getPackageDotJson } from '../utils/clack';

export type KitVersionBucket =
  | 'none'
  | 'invalid'
  | '0.x'
  | '>=1.0.0 <1.24.0'
  | '>=1.24.0 <2.31.0'
  | '>=2.31.0';

export function getKitVersionBucket(
  version: string | undefined,
): KitVersionBucket {
  if (!version) {
    return 'none';
  }

  const minVer = minVersion(version);
  if (!minVer) {
    return 'invalid';
  }

  if (lt(minVer, '1.0.0')) {
    return '0.x';
  } else if (lt(minVer, '1.24.0')) {
    return '>=1.0.0 <1.24.0';
  } else if (lt(minVer, '2.31.0')) {
    // This is the version when the client-side invalidation fix was released
    // https://github.com/sveltejs/kit/releases/tag/%40sveltejs%2Fkit%401.24.0
    // https://github.com/sveltejs/kit/pull/10576
    return '>=1.24.0 <2.31.0';
  } else {
    // This is the version where sveltekit-native tracing and instrumentation was
    // introduced as an experimental feature.
    return '>=2.31.0';
  }
}

export function getSvelteVersionBucket(
  version: string | undefined,
): 'none' | 'invalid' | '<3.0.0' | '3.x' | '4.x' | '>4.x' {
  if (!version) {
    return 'none';
  }

  const minVer = minVersion(version);
  if (!minVer) {
    return 'invalid';
  }

  if (lt(minVer, '3.0.0')) {
    return '<3.0.0';
  }
  if (lt(minVer, '4.0.0')) {
    return '3.x';
  }
  if (lt(minVer, '5.0.0')) {
    return '4.x';
  }
  // Svelte 5 isn't released yet but it's being worked on
  return '>4.x';
}

export async function isUsingSvelte5(): Promise<boolean> {
  const svelteVersion = getPackageVersion('svelte', await getPackageDotJson());
  const flooredSvelteVersion = svelteVersion
    ? minVersion(svelteVersion)
    : undefined;
  return flooredSvelteVersion ? gte(flooredSvelteVersion, '5.0.0') : false;
}
