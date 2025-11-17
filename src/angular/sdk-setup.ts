/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';

import * as fs from 'fs';
import * as path from 'path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { updateAppConfigMod } from './codemods/app-config';
import { updateAppEntryMod } from './codemods/main';
import { hasSentryContent } from '../utils/ast-utils';
import * as Sentry from '@sentry/node';

import type { namedTypes as t } from 'ast-types';
import type { SemVer } from 'semver';

export async function initializeSentryOnApplicationEntry(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
  spotlightMode = false,
): Promise<void> {
  const appEntryFilename = 'main.ts';
  const appEntryPath = path.join(process.cwd(), 'src', appEntryFilename);

  const originalAppEntry = await loadFile(appEntryPath);

  if (hasSentryContent(originalAppEntry.$ast as t.Program)) {
    clack.log.warn(
      `File ${chalk.cyan(appEntryFilename)} already contains Sentry.
Skipping adding Sentry functionality to ${chalk.cyan(appEntryFilename)}.`,
    );

    return;
  }

  const updatedAppEntryMod = updateAppEntryMod(
    originalAppEntry,
    dsn,
    selectedFeatures,
    spotlightMode,
  );

  try {
    await writeFile(updatedAppEntryMod.$ast, appEntryPath);
  } catch (error: unknown) {
    clack.log.error(
      `Error while adding Sentry to ${chalk.cyan(appEntryFilename)}`,
    );

    clack.log.warn(
      `Please refer to the documentation for manual setup:
${chalk.underline(
  'https://docs.sentry.io/platforms/javascript/guides/angular/#configure',
)}`,
    );

    return;
  }

  clack.log.success(
    `Successfully initialized Sentry on ${chalk.cyan(appEntryFilename)}`,
  );
}

export async function updateAppConfig(
  angularVersion: SemVer,
  isTracingEnabled: boolean,
): Promise<void> {
  const appConfigFilename = 'app.config.ts';
  const appConfigPath = path.join(
    process.cwd(),
    'src',
    'app',
    appConfigFilename,
  );

  if (!fs.existsSync(appConfigPath)) {
    Sentry.setTag('angular-app-config-found', false);

    clack.log.warn(
      `File ${chalk.cyan(
        appConfigFilename,
      )} not found. Skipping adding Sentry functionality.`,
    );

    clack.log.warn(`Please refer to the documentation for manual setup:
${chalk.underline(
  'https://docs.sentry.io/platforms/javascript/guides/angular/#configure',
)}`);

    return;
  }

  Sentry.setTag('angular-app-config-found', true);

  const appConfig = await loadFile(appConfigPath);

  if (hasSentryContent(appConfig.$ast as t.Program)) {
    clack.log.warn(
      `File ${chalk.cyan(appConfigFilename)} already contains Sentry.
  Skipping adding Sentry functionality to ${chalk.cyan(appConfigFilename)}.`,
    );

    return;
  }

  try {
    const updatedAppConfigMod = updateAppConfigMod(
      appConfig,
      angularVersion,
      isTracingEnabled,
    );

    await writeFile(updatedAppConfigMod.$ast, appConfigPath);
  } catch (error: unknown) {
    clack.log.error(
      `Error while updating your app config ${chalk.cyan(appConfigFilename)}.`,
    );

    clack.log.info(
      chalk.dim(
        typeof error === 'object' && error != null && 'toString' in error
          ? error.toString()
          : typeof error === 'string'
          ? error
          : '',
      ),
    );

    clack.log.warn(`Please refer to the documentation for manual setup:
${chalk.underline(
  'https://docs.sentry.io/platforms/javascript/guides/angular/#configure',
)}`);

    return;
  }

  clack.log.success(
    `Successfully updated your app config ${chalk.cyan(appConfigFilename)}`,
  );
}
