// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import fs from 'fs';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, generateCode } from 'magicast';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { addNuxtModule } from 'magicast/helpers';
import path from 'path';
import { getDefaultNuxtConfig, getSentryConfigContents } from './templates';
import {
  abort,
  abortIfCancelled,
  featureSelectionPrompt,
  isUsingTypeScript,
} from '../utils/clack-utils';
import { traceStep } from '../telemetry';

const possibleNuxtConfig = [
  'nuxt.config.js',
  'nuxt.config.mjs',
  'nuxt.config.cjs',
  'nuxt.config.ts',
  'nuxt.config.mts',
  'nuxt.config.cts',
];

export async function getNuxtConfig(): Promise<string> {
  let configFile = possibleNuxtConfig.find((fileName) =>
    fs.existsSync(path.join(process.cwd(), fileName)),
  );

  if (!configFile) {
    clack.log.info('No Nuxt config file found, creating a new one.');
    Sentry.setTag('nuxt-config-strategy', 'create');
    // nuxt recommends its config to be .ts by default
    configFile = 'nuxt.config.ts';

    await fs.promises.writeFile(
      path.join(process.cwd(), configFile),
      getDefaultNuxtConfig(),
      { encoding: 'utf-8', flag: 'w' },
    );

    clack.log.success(`Created ${chalk.cyan('nuxt.config.ts')}.`);
  }

  return path.join(process.cwd(), configFile);
}

export async function addSDKModule(
  config: string,
  options: { org: string; project: string; url?: string },
): Promise<void> {
  clack.log.info('Adding Sentry Nuxt Module to Nuxt config.');

  try {
    const mod = await loadFile(config);

    addNuxtModule(mod, '@sentry/nuxt/module', 'sentry', {
      sourceMapsUploadOptions: {
        org: options.org,
        project: options.project,
        ...(options.url && { url: options.url }),
      },
    });
    addNuxtModule(mod, '@sentry/nuxt/module', 'sourcemap', { client: true });

    const { code } = generateCode(mod);

    await fs.promises.writeFile(config, code, { encoding: 'utf-8', flag: 'w' });
  } catch (e: unknown) {
    clack.log.error(
      'Error while adding the Sentry Nuxt Module to the Nuxt config.',
    );
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );
    Sentry.captureException('Error while setting up the Nuxt SDK');
    await abort('Exiting Wizard');
  }
}

export async function createConfigFiles(dsn: string) {
  const selectedFeatures = await featureSelectionPrompt([
    {
      id: 'performance',
      prompt: `Do you want to enable ${chalk.bold(
        'Tracing',
      )} to track the performance of your application?`,
      enabledHint: 'recommended',
    },
    {
      id: 'replay',
      prompt: `Do you want to enable ${chalk.bold(
        'Sentry Session Replay',
      )} to get a video-like reproduction of errors during a user session?`,
      enabledHint: 'recommended, but increases bundle size',
    },
  ] as const);

  const typeScriptDetected = isUsingTypeScript();

  const configVariants = ['server', 'client'] as const;

  for (const configVariant of configVariants) {
    await traceStep(`create-sentry-${configVariant}-config`, async () => {
      const jsConfig = `sentry.${configVariant}.config.js`;
      const tsConfig = `sentry.${configVariant}.config.ts`;

      const jsConfigExists = fs.existsSync(path.join(process.cwd(), jsConfig));
      const tsConfigExists = fs.existsSync(path.join(process.cwd(), tsConfig));

      let shouldWriteFile = true;

      if (jsConfigExists || tsConfigExists) {
        const existingConfigs = [];

        if (jsConfigExists) {
          existingConfigs.push(jsConfig);
        }

        if (tsConfigExists) {
          existingConfigs.push(tsConfig);
        }

        const overwriteExistingConfigs = await abortIfCancelled(
          clack.confirm({
            message: `Found existing Sentry ${configVariant} config (${existingConfigs.join(
              ', ',
            )}). Overwrite ${existingConfigs.length > 1 ? 'them' : 'it'}?`,
          }),
        );
        Sentry.setTag(
          `overwrite-${configVariant}-config`,
          overwriteExistingConfigs,
        );

        shouldWriteFile = overwriteExistingConfigs;

        if (overwriteExistingConfigs) {
          if (jsConfigExists) {
            fs.unlinkSync(path.join(process.cwd(), jsConfig));
            clack.log.warn(`Removed existing ${chalk.cyan(jsConfig)}.`);
          }
          if (tsConfigExists) {
            fs.unlinkSync(path.join(process.cwd(), tsConfig));
            clack.log.warn(`Removed existing ${chalk.cyan(tsConfig)}.`);
          }
        }
      }

      if (shouldWriteFile) {
        await fs.promises.writeFile(
          path.join(process.cwd(), typeScriptDetected ? tsConfig : jsConfig),
          getSentryConfigContents(dsn, configVariant, selectedFeatures),
          { encoding: 'utf8', flag: 'w' },
        );
        clack.log.success(
          `Created fresh ${chalk.cyan(
            typeScriptDetected ? tsConfig : jsConfig,
          )}.`,
        );
        Sentry.setTag(`created-${configVariant}-config`, true);
      }
    });
  }
}
