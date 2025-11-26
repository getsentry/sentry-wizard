// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export type PackageDotJson = {
  version?: string;
  scripts?: Record<string, string | undefined>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  resolutions?: Record<string, string>;
  overrides?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
  };
};

type NpmPackage = {
  name: string;
  version: string;
};

type PnpmCatalogs = Record<string, Record<string, string>>;

type PnpmWorkspace = {
  catalog?: Record<string, string>;
  catalogs?: PnpmCatalogs;
  [key: string]: unknown;
};

/**
 * Finds and parses the pnpm-workspace.yaml file to extract catalog definitions.
 * Searches up to 10 parent directories from the current working directory.
 * Returns null if the file doesn't exist or can't be parsed.
 */
function getPnpmWorkspace(): PnpmWorkspace | null {
  let currentDir = process.cwd();
  const maxLevels = 10;

  for (let i = 0; i < maxLevels; i++) {
    const workspaceFile = path.join(currentDir, 'pnpm-workspace.yaml');

    if (fs.existsSync(workspaceFile)) {
      const content = fs.readFileSync(workspaceFile, 'utf-8');

      try {
        const parsed = yaml.load(content) as PnpmWorkspace;

        return parsed ?? null;
      } catch {
        clack.log.error('Could not parse pnpm-workspace.yaml.');
        return null;
      }
    }

    const parentDir = path.dirname(currentDir);

    // Stop if we've reached the root directory
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  clack.log.error('Could not find pnpm-workspace.yaml.');

  return null;
}

/**
 * Resolves a catalog reference (e.g., "catalog:" or "catalog:sveltekit") to the actual version.
 * - "catalog:" refers to the default catalog (workspace.catalog)
 * - "catalog:customcatalog" refers to a named catalog (workspace.catalogs.customcatalog)
 * Returns the actual version if found, or undefined if the catalog or package doesn't exist.
 */
function resolveCatalogVersion(
  catalogRef: string,
  packageName: string,
): string | undefined {
  const catalogName = catalogRef.replace(/^catalog:/, '');
  const workspace = getPnpmWorkspace();

  if (!workspace) {
    return undefined;
  }

  const catalog =
    catalogName === '' ? workspace.catalog : workspace.catalogs?.[catalogName];

  return catalog?.[packageName];
}

/**
 * Checks if @param packageJson has any of the @param packageNamesList package names
 * listed as a dependency or devDependency.
 * If so, it returns the first package name that is found, including the
 * version (range) specified in the package.json.
 */
export function findInstalledPackageFromList(
  packageNamesList: string[],
  packageJson: PackageDotJson,
): NpmPackage | undefined {
  return packageNamesList
    .map((packageName) => ({
      name: packageName,
      version: getPackageVersion(packageName, packageJson),
    }))
    .find((sdkPackage): sdkPackage is NpmPackage => !!sdkPackage.version);
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
  const rawVersion =
    packageJson?.dependencies?.[packageName] ||
    packageJson?.devDependencies?.[packageName];

  if (!rawVersion) {
    return undefined;
  }

  const version = rawVersion.startsWith('catalog:')
    ? resolveCatalogVersion(rawVersion, packageName)
    : rawVersion;

  return version;
}
