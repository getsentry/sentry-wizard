import { lstatSync } from 'fs';
import { major, minVersion } from 'semver';

import { exists } from '../../lib/Helper/File';

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

export function directoryExists(dirPath: string): boolean {
  return exists(dirPath) && lstatSync(dirPath).isDirectory();
}