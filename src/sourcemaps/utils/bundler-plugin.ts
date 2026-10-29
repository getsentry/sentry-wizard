import * as Sentry from '@sentry/node';
import { minVersion, satisfies } from 'semver';

import {
  getPackageDotJson,
  installPackage,
  printSdkV11MigrationGuideIfOutdated,
} from '../../utils/clack';
import {
  getPackageVersion,
  hasPackageInstalled,
} from '../../utils/package-json';

export type Bundler = 'vite' | 'webpack' | 'rollup' | 'esbuild';

const BUNDLER_PLUGINS_PACKAGE = '@sentry/bundler-plugins';

type SdkWithBundlerPlugins = {
  name: string;
  bundlers: Bundler[];
  // First SDK version that exports the plugin subpaths.
  minVersion: string;
};

// SDKs that depend on @sentry/node come first so that we pick the
// top-level SDK when both are listed in package.json.
const SDKS_WITH_BUNDLER_PLUGINS: SdkWithBundlerPlugins[] = [
  { name: '@sentry/nestjs', bundlers: ['webpack'], minVersion: '11.10.0' },
  {
    name: '@sentry/aws-serverless',
    bundlers: ['esbuild'],
    minVersion: '11.10.0',
  },
  {
    name: '@sentry/node',
    bundlers: ['vite', 'webpack', 'rollup', 'esbuild'],
    minVersion: '11.0.0',
  },
];

/**
 * Makes sure the Sentry bundler plugin for @param bundler is available in
 * the user's project and returns the module path to import it from.
 *
 * If an installed SDK ships the plugin, the SDK is updated to v11 and the
 * plugin is imported from the SDK. Otherwise, or if the user declines the
 * SDK update, `@sentry/bundler-plugins` is installed as a dev dependency.
 */
export async function ensureBundlerPlugin(bundler: Bundler): Promise<string> {
  const packageJson = await getPackageDotJson();

  const sdk = SDKS_WITH_BUNDLER_PLUGINS.find(
    (candidate) =>
      candidate.bundlers.includes(bundler) &&
      hasPackageInstalled(candidate.name, packageJson),
  );

  if (sdk) {
    printSdkV11MigrationGuideIfOutdated(sdk.name, packageJson);

    await installPackage({
      packageName: `${sdk.name}@^11`,
      packageNameDisplayLabel: sdk.name,
      alreadyInstalled: true,
    });

    // The user may have declined the update, so re-read package.json to
    // learn which version is actually installed.
    const installedRange = getPackageVersion(
      sdk.name,
      await getPackageDotJson(),
    );

    if (sdkShipsBundlerPlugins(installedRange, sdk.minVersion)) {
      Sentry.setTag('bundler-plugin-source', 'sdk');
      return `${sdk.name}/${bundler}`;
    }
  }

  await installPackage({
    packageName: `${BUNDLER_PLUGINS_PACKAGE}@^11`,
    packageNameDisplayLabel: BUNDLER_PLUGINS_PACKAGE,
    alreadyInstalled: hasPackageInstalled(BUNDLER_PLUGINS_PACKAGE, packageJson),
    devDependency: true,
  });

  Sentry.setTag('bundler-plugin-source', 'bundler-plugins');
  return `${BUNDLER_PLUGINS_PACKAGE}/${bundler}`;
}

function sdkShipsBundlerPlugins(
  installedRange: string | undefined,
  requiredVersion: string,
): boolean {
  if (!installedRange) {
    return false;
  }

  try {
    const installedVersion = minVersion(installedRange)?.version;
    return (
      !!installedVersion &&
      satisfies(installedVersion, `>=${requiredVersion}`, {
        includePrerelease: true,
      })
    );
  } catch {
    return false;
  }
}
