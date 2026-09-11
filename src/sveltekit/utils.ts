import { lt, major, minVersion } from 'semver';

/**
 * Version range of `@sentry/sveltekit` the wizard installs. Also decides the
 * default import path of the Vite plugin when the installed version is unknown.
 */
export const SENTRY_SVELTEKIT_SDK_RANGE = '^10';

/** Root export. Exposes `sentrySvelteKit` up to SDK v10 only. */
export const SENTRY_SVELTEKIT_ROOT_IMPORT_PATH = '@sentry/sveltekit';

/** Subpath that exposes `sentrySvelteKit` from SDK v11 on. v10 does not ship it. */
export const SENTRY_SVELTEKIT_VITE_IMPORT_PATH = '@sentry/sveltekit/vite';

/**
 * Returns the module `sentrySvelteKit` must be imported from for the installed
 * SDK. v11 moved the Vite plugin to the `/vite` subpath and removed it from the
 * root export, while v10 only has it on the root export. Unknown or unparseable
 * versions fall back to whatever the wizard would install.
 */
export function getSentrySvelteKitVitePluginImportPath(
  installedSdkVersion: string | undefined,
): string {
  const sdkMajor =
    getMajor(installedSdkVersion) ?? getMajor(SENTRY_SVELTEKIT_SDK_RANGE) ?? 0;

  return sdkMajor >= 11
    ? SENTRY_SVELTEKIT_VITE_IMPORT_PATH
    : SENTRY_SVELTEKIT_ROOT_IMPORT_PATH;
}

function getMajor(version: string | undefined): number | undefined {
  if (!version) {
    return undefined;
  }
  try {
    const minVer = minVersion(version);
    return minVer ? major(minVer) : undefined;
  } catch {
    return undefined;
  }
}

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

  try {
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
  } catch {
    return 'invalid';
  }
}

export function getSvelteVersionBucket(
  version: string | undefined,
): 'none' | 'invalid' | '<3.0.0' | '3.x' | '4.x' | '5.x' | '>5.x' {
  if (!version) {
    return 'none';
  }

  try {
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
    if (lt(minVer, '6.0.0')) {
      return '5.x';
    }
    // bucket for any future versions of svelte not covered by the other buckets
    return '>5.x';
  } catch {
    return 'invalid';
  }
}
