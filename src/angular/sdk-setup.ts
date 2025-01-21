/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';

import * as path from 'path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { updateAppEntryMod } from './codemods/main';
import { updateAppConfigMod } from './codemods/app-config';
import type { SemVer } from 'semver';

export function hasSentryContent(
  fileName: string,
  fileContent: string,
  expectedContent = '@sentry/angular',
): boolean {
  const includesContent = fileContent.includes(expectedContent);

  if (includesContent) {
    clack.log.warn(
      `File ${chalk.cyan(
        path.basename(fileName),
      )} already contains ${expectedContent}.
Skipping adding Sentry functionality to ${chalk.cyan(
        path.basename(fileName),
      )}.`,
    );
  }

  return includesContent;
}

export async function initalizeSentryOnApplicationEntry(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): Promise<void> {
  const appEntryFilename = 'main.ts';
  const appEntryPath = path.join(process.cwd(), 'src', appEntryFilename);

  const originalAppEntry = await loadFile(appEntryPath);

  if (hasSentryContent(appEntryPath, originalAppEntry.$code)) {
    return;
  }

  try {
    const updatedAppEntryMod = updateAppEntryMod(
      originalAppEntry,
      dsn,
      selectedFeatures,
    );

    await writeFile(updatedAppEntryMod.$ast, appEntryPath);
  } catch (error: unknown) {
    clack.log.error(
      `Error while adding Sentry to ${chalk.cyan(appEntryFilename)}`,
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

  const appConfig = await loadFile(appConfigPath);

  if (hasSentryContent(appConfigPath, appConfig.$code)) {
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
