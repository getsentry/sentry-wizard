export type PackageDotJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type NpmPackage = {
  name: string;
  version: string;
};

/**
 * Checks if @param packageJson has any of the @param packageNamesList package names
 * listed as a dependency or devDependency.
 * If so, it returns the first package name that is found, including the
 * version (range) specified in the package.json.
 */
export function findPackageFromList(
  packageNamesList: string[],
  packageJson: PackageDotJson,
): NpmPackage | undefined {
  const installedSdkPackages = packageNamesList
    .map((packageName) => ({
      name: packageName,
      version: getPackageVersion(packageName, packageJson),
    }))
    .filter((sdkPackage): sdkPackage is NpmPackage => !!sdkPackage.version);

  if (installedSdkPackages.length > 0) {
    return installedSdkPackages[0];
  }
  return undefined;
}

export function hasPackageInstalled(
  packageName: string,
  packageJson: PackageDotJson,
): boolean {
  return getPackageVersion(packageName, packageJson) !== undefined;
}

export function getPackageVersion(
  packageName: string,
  packageJson: PackageDotJson,
): string | undefined {
  return (
    packageJson?.dependencies?.[packageName] ||
    packageJson?.devDependencies?.[packageName]
  );
}
