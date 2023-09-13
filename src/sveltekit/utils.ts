import { lt } from 'semver';

export function getKitVersionBucket(version: string | undefined): string {
  if (!version) {
    return 'none';
  }
  if (lt(version, '1.0.0')) {
    return '0.x';
  } else if (lt(version, '1.24.0')) {
    return '>=1.0.0 <1.24.0';
  } else {
    // This is the version when the client-side invalidation fix was released
    // https://github.com/sveltejs/kit/releases/tag/%40sveltejs%2Fkit%401.24.0
    // https://github.com/sveltejs/kit/pull/10576
    return '>=1.24.0';
  }
}

export function getSvelteVersionBucket(version: string | undefined): string {
  if (!version) {
    return 'none';
  }
  if (lt(version, '3.0.0')) {
    return '<3.0.0';
  }
  if (lt(version, '4.0.0')) {
    return '3.x';
  }
  if (lt(version, '5.0.0')) {
    return '4.x';
  }
  // Svelte 5 isn't released yet but it's being worked on
  return '>=5.0.0';
}
