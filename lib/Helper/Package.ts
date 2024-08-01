import * as _ from 'lodash';
import { satisfies, subset, valid, validRange } from 'semver';

import { green, red } from './Logging';

export function checkPackageVersion(
  appPackage: unknown,
  packageName: string,
  acceptableVersions: string,
  canBeLatest: boolean,
): boolean {
  const depsVersion = _.get(appPackage, ['dependencies', packageName]);
  const devDepsVersion = _.get(appPackage, ['devDependencies', packageName]);

  if (!depsVersion && !devDepsVersion) {
    red(`✗ ${packageName} isn't in your dependencies.`);
    red('  Please install it with yarn/npm.');
    return false;
  } else if (
    !fulfillsVersionRange(depsVersion, acceptableVersions, canBeLatest) &&
    !fulfillsVersionRange(devDepsVersion, acceptableVersions, canBeLatest)
  ) {
    red(
      `✗ Your \`package.json\` specifies a version of \`${packageName}\` outside of the compatible version range ${acceptableVersions}.\n`,
    );
    return false;
  } else {
    green(
      `✓ A compatible version of \`${packageName}\` is specified in \`package.json\`.`,
    );
    return true;
  }
}

function fulfillsVersionRange(
  version: string,
  acceptableVersions: string,
  canBeLatest: boolean,
): boolean {
  if (version === 'latest') {
    return canBeLatest;
  }

  let cleanedUserVersion, isRange;

  if (valid(version)) {
    cleanedUserVersion = valid(version);
    isRange = false;
  } else if (validRange(version)) {
    cleanedUserVersion = validRange(version);
    isRange = true;
  }

  return (
    // If the given version is a bogus format, this will still be undefined and we'll automatically reject it
    !!cleanedUserVersion &&
    (isRange
      ? subset(cleanedUserVersion, acceptableVersions)
      : satisfies(cleanedUserVersion, acceptableVersions))
  );
}

/**
 * Determines if the passed `package.json` object has the passed package installed.
 *
 * @param appPackage The `package.json` object
 * @param packageName The name of the package to check for
 *
 * @returns `true` if the package is installed, `false` otherwise
 */
export function hasPackageInstalled(
  appPackage: {
    dependencies: Record<string, unknown>;
    devDependencies: Record<string, unknown>;
  },
  packageName: string,
): boolean {
  const depsVersion = appPackage.dependencies[packageName];
  const devDepsVersion = appPackage.devDependencies[packageName];
  return !!depsVersion || !!devDepsVersion;
}
