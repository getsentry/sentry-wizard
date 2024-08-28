import { major, minVersion } from 'semver';
import { detectPackageManger } from '../utils/package-manager';

export function getNextJsVersionBucket(version: string | undefined) {
  if (!version) {
    return 'none';
  }

  try {
    const minVer = minVersion(version);
    if (!minVer) {
      return 'invalid';
    }
    const majorVersion = major(minVer);
    if (majorVersion >= 11) {
      return `${majorVersion}.x`;
    }
    return '<11.0.0';
  } catch {
    return 'unknown';
  }
}

export function getDevCommand() {
  const manager = detectPackageManger();
  if (manager) {
    return `${manager.devCommand}`;
  }
  return 'next dev';
}
