// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import { PackageDotJson, hasPackageInstalled } from '../utils/package-json';

/**
 * Checks if the project is managed by Expo
 * based on the main entry in package.json
 * and expo package presence in dependencies.
 */
export function isExpoManagedProject(
  projectPackageJson: PackageDotJson,
): boolean {
  const hasExpoEntry =
    projectPackageJson.main === 'node_modules/expo/AppEntry.js';
  const hasExpoInstalled = hasPackageInstalled('expo', projectPackageJson);

  return hasExpoEntry && hasExpoInstalled;
}

export function printSentryExpoMigrationOutro(): void {
  clack.outro(
    `Deprecated ${chalk.cyan(
      'sentry-expo',
    )} package installed in your dependencies. Please follow the migration guide at ${chalk.cyan(
      'https://docs.sentry.io/platforms/react-native/manual-setup/',
    )}`,
  );
}

/**
 * Finds app.config.{js, ts, json} in the project root and add Sentry Expo `withSentry` plugin.
 */
export function patchExpoAppConfig() {
  // TODO: implement
}
