/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, ProxifiedModule, writeFile } from 'magicast';

import * as path from 'path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { updateAppModuleMod } from './codemods/main';
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

export async function initalizeSentryOnAppModule(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): Promise<void> {
  const appModuleFilename = 'main.ts';
  const appModulePath = path.join(process.cwd(), 'src', appModuleFilename);

  const originalAppModule = await loadFile(appModulePath);

  if (hasSentryContent(appModulePath, originalAppModule.$code)) {
    return;
  }

  const updatedAppModuleMod = updateAppModuleMod(
    originalAppModule,
    dsn,
    selectedFeatures,
  );

  await writeFile(updatedAppModuleMod.$ast, appModulePath);

  clack.log.success(
    `Successfully initialized Sentry on your app module ${chalk.cyan(
      appModuleFilename,
    )}`,
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
  let updatedAppConfigMod: ProxifiedModule<any>;

  try {
    updatedAppConfigMod = updateAppConfigMod(
      appConfig,
      angularVersion,
      isTracingEnabled,
    );

    await writeFile(updatedAppConfigMod.$ast, appConfigPath);
  } catch (error) {
    clack.log.error(
      `Failed to update your app config ${chalk.cyan(appConfigFilename)}`,
    );

    clack.log.error(error);

    return;
  }

  clack.log.success(
    `Successfully updated your app config ${chalk.cyan(appConfigFilename)}`,
  );
}
