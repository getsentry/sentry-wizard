// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import { EOL } from 'os';

import { isPlainObject } from '@sentry/utils';
import * as Sentry from '@sentry/node';
import {
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../utils/clack-utils';
import { RNCliSetupConfigContent } from './react-native-wizard';
import { traceStep } from '../telemetry';

export const SENTRY_EXPO_PLUGIN_NAME = '@sentry/react-native/expo';
export const DEPRECATED_SENTRY_EXPO_PLUGIN_NAME = 'sentry-expo';

export const SENTRY_PLUGIN_FUNCTION_NAME = 'withSentry';

const APP_CONFIG_JSON = `app.json`;

export interface AppConfigJson {
  expo?: {
    plugins?: Array<[string, undefined | Record<string, unknown>]>;
  };
}

export function printSentryExpoMigrationOutro(): void {
  clack.outro(
    `Deprecated ${chalk.cyan(
      'sentry-expo',
    )} package installed in your dependencies. Please follow the migration guide at ${chalk.cyan(
      'https://docs.sentry.io/platforms/react-native/migration/sentry-expo/',
    )}`,
  );
}

/**
 * Finds app.json in the project root and add Sentry Expo `withSentry` plugin.
 */
export async function patchExpoAppConfig(options: RNCliSetupConfigContent) {
  function showInstructions() {
    return showCopyPasteInstructions(
      APP_CONFIG_JSON,
      getSentryAppConfigJsonCodeSnippet(options),
      'This ensures auto upload of source maps during native app build.',
    );
  }

  const appConfigJsonExists = fs.existsSync(APP_CONFIG_JSON);

  Sentry.setTag(
    'app-config-file-status',
    appConfigJsonExists ? 'found' : 'not-found',
  );
  if (!appConfigJsonExists) {
    return await showInstructions();
  }

  const patched = await patchAppConfigJson(APP_CONFIG_JSON, options);
  if (!patched) {
    return await showInstructions();
  }
}

async function patchAppConfigJson(
  path: string,
  options: RNCliSetupConfigContent,
): Promise<boolean> {
  const appConfigContent = (
    await fs.promises.readFile(path, { encoding: 'utf-8' })
  ).toString();
  const patchedContent = traceStep('app-config-json-patch', () =>
    addWithSentryToAppConfigJson(appConfigContent, options),
  );
  if (patchedContent === null) {
    return false;
  }

  try {
    await fs.promises.writeFile(path, patchedContent);
  } catch (error) {
    Sentry.setTag('app-config-file-status', 'json-write-error');
    clack.log.error(`Unable to write ${chalk.cyan('app.config.json')}.`);
    return false;
  }
  Sentry.setTag('app-config-file-status', 'json-write-success');
  clack.log.success(
    `Added Sentry Expo plugin to ${chalk.cyan('app.config.json')}.`,
  );
  return true;
}

export function addWithSentryToAppConfigJson(
  appConfigContent: string,
  options: RNCliSetupConfigContent,
): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsedAppConfig: AppConfigJson = JSON.parse(appConfigContent);
    const includesWithSentry =
      appConfigContent.includes(SENTRY_EXPO_PLUGIN_NAME) ||
      appConfigContent.includes(DEPRECATED_SENTRY_EXPO_PLUGIN_NAME);

    if (includesWithSentry) {
      Sentry.setTag('app-config-file-status', 'already-patched');
      clack.log.warn(
        `Your ${chalk.cyan(
          'app.config.json',
        )} already includes the Sentry Expo plugin.`,
      );
      return null;
    }

    if (
      parsedAppConfig.expo !== undefined &&
      !isPlainObject(parsedAppConfig.expo)
    ) {
      Sentry.setTag('app-config-file-status', 'invalid-json');
      return null;
    }
    if (
      parsedAppConfig.expo &&
      parsedAppConfig.expo.plugins !== undefined &&
      !Array.isArray(parsedAppConfig.expo.plugins)
    ) {
      Sentry.setTag('app-config-file-status', 'invalid-json');
      return null;
    }

    parsedAppConfig.expo = parsedAppConfig.expo ?? {};
    parsedAppConfig.expo.plugins = parsedAppConfig.expo.plugins ?? [];
    parsedAppConfig.expo.plugins.push([
      SENTRY_EXPO_PLUGIN_NAME,
      {
        url: options.url,
        project: options.project,
        organization: options.org,
      },
    ]);

    return JSON.stringify(parsedAppConfig, null, 2) + EOL;
  } catch (error) {
    Sentry.setTag('app-config-file-status', 'invalid-json');
    clack.log.error(
      `Unable to parse your ${chalk.cyan(
        'app.config.json',
      )}. Make sure it has a valid format!`,
    );
    return null;
  }
}

export function getSentryAppConfigJsonCodeSnippet({
  url,
  project,
  org,
}: Omit<RNCliSetupConfigContent, 'authToken'>) {
  return makeCodeSnippet(true, (unchanged, plus, _minus) => {
    return unchanged(`{
  "name": "my app",
  "plugins": [
    ${plus(`[
      "@sentry/react-native/expo",
      {
        "url": "${url}",
        "project": "${project}",
        "organization": "${org}"
      }
    ]`)}
  ],
}`);
  });
}
