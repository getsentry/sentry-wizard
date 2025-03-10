import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, loadFile } from 'magicast';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { addNuxtModule } from 'magicast/helpers';
import opn from 'opn';
import { type SemVer, lt } from 'semver';
import { traceStep } from '../telemetry';
import {
  abortIfCancelled,
  askShouldAddPackageOverride,
  askShouldInstallPackage,
  featureSelectionPrompt,
  installPackage,
  isUsingTypeScript,
} from '../utils/clack-utils';
import {
  type PackageDotJson,
  hasPackageInstalled,
} from '../utils/package-json';
import { PNPM, type PackageManager } from '../utils/package-manager';
import {
  getConfigBody,
  getDefaultNuxtConfig,
  getNuxtModuleFallbackTemplate,
  getSentryConfigContents,
} from './templates';
import { type DeploymentPlatform, deploymentPlatforms } from './types';

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

export async function askDeploymentPlatform(): Promise<
  DeploymentPlatform | symbol
> {
  return await abortIfCancelled(
    clack.select({
      message: 'Please select your deployment platform.',
      options: deploymentPlatforms.map((platform) => ({
        value: platform,
        label: `${platform.charAt(0).toUpperCase()}${platform.slice(1)}`,
      })),
    }),
  );
}

export async function addSDKModule(
  config: string,
  options: { org: string; project: string; url: string; selfHosted: boolean },
  deploymentPlatform: DeploymentPlatform | symbol,
): Promise<void> {
  const failureTagKey = 'modify-nuxt-config-error';

  const shouldTopLevelImport =
    deploymentPlatform === 'vercel' || deploymentPlatform === 'netlify';

  if (shouldTopLevelImport) {
    clack.log.warn(
      `Sentry needs to be initialized before the application starts. ${chalk.cyan(
        `${deploymentPlatform
          .charAt(0)
          .toUpperCase()}${deploymentPlatform.slice(1)}`,
      )} does not support this yet.\n\nWe will inject the Sentry server-side config at the top of your Nuxt server entry file instead.\n\nThis comes with some restrictions, for more info see:\n\n${chalk.underline(
        'https://docs.sentry.io/platforms/javascript/guides/nuxt/install/top-level-import/',
      )} `,
    );
  }

  let module;

  try {
    module = await loadFile(config);
  } catch (e) {
    if (e instanceof Error) {
      if (e instanceof SyntaxError || e.message.includes('Unexpected token')) {
        Sentry.setTag(failureTagKey, 'loadFile-failed-syntax-error');
      } else if (
        e.message.includes('ENOENT') ||
        e.message.includes('no such file')
      ) {
        Sentry.setTag(failureTagKey, 'loadFile-failed-file-not-found');
      }
    } else {
      Sentry.setTag(failureTagKey, 'loadFile-failed');
    }

    clack.log.error(
      `Error while loading Nuxt config file: ${
        e instanceof Error ? e.message : 'Unknown'
      }`,
    );

    showFallbackInstructions(config, options, shouldTopLevelImport);
    throw e;
  }

  try {
    addNuxtModule(module, '@sentry/nuxt/module', 'sentry', {
      sourceMapsUploadOptions: {
        org: options.org,
        project: options.project,
        ...(options.selfHosted && { url: options.url }),
      },
      ...(shouldTopLevelImport && {
        autoInjectServerSentry: 'top-level-import',
      }),
    });
  } catch (e) {
    Sentry.setTag(failureTagKey, 'adding-sentry-options-failed');

    clack.log.error(
      `Error while modifying 'sentry' in Nuxt config: ${
        e instanceof Error ? e.message : 'Unknown'
      }`,
    );

    showFallbackInstructions(config, options, shouldTopLevelImport);
    throw e;
  }

  try {
    addNuxtModule(module, '@sentry/nuxt/module', 'sourcemap', {
      client: 'hidden',
    });
  } catch (e) {
    Sentry.setTag(failureTagKey, 'adding-sourcemap-options-failed');

    clack.log.error(
      `Error while modifying 'sourcemap' in Nuxt config: ${
        e instanceof Error ? e.message : 'Unknown'
      }`,
    );

    showFallbackInstructions(config, options, shouldTopLevelImport);
    throw e;
  }

  let code;

  try {
    ({ code } = generateCode(module));
  } catch (e) {
    Sentry.setTag(failureTagKey, 'generateCode-failed');

    clack.log.error(
      `Error while generating module code: ${
        e instanceof Error ? e.message : 'Unknown'
      }`,
    );

    showFallbackInstructions(config, options, shouldTopLevelImport);
    throw e;
  }

  try {
    await fs.promises.writeFile(config, code, { encoding: 'utf-8', flag: 'w' });

    clack.log.success(
      `Added Sentry Nuxt Module to ${chalk.cyan(path.basename(config))}.`,
    );
  } catch (e: unknown) {
    Sentry.setTag(failureTagKey, 'writeFile-failed');

    clack.log.error(
      `Error while writing Nuxt config: ${
        e instanceof Error ? e.message : 'Unknown'
      }`,
    );

    showFallbackInstructions(config, options, shouldTopLevelImport);
    throw e;
  }
}

function showFallbackInstructions(
  config: string,
  options: { org: string; project: string; url: string; selfHosted: boolean },
  shouldTopLevelImport: boolean,
) {
  clack.log.warn(
    `Please add the following settings to ${chalk.cyan(
      path.basename(config),
    )}:`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `\n\n${getNuxtModuleFallbackTemplate(options, shouldTopLevelImport)}\n\n`,
  );
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
        'Session Replay',
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
          `Created new ${chalk.cyan(
            typeScriptDetected ? tsConfig : jsConfig,
          )}.`,
        );
        Sentry.setTag(`created-${configVariant}-config`, true);
      } else {
        clack.log.info(
          `Okay, here are the changes your ${chalk.cyan(
            typeScriptDetected ? tsConfig : jsConfig,
          )} should contain:`,
        );
        // eslint-disable-next-line no-console
        console.log(
          '\n\n  ' +
            getConfigBody(dsn, configVariant, selectedFeatures) +
            '\n\n',
        );
      }
    });
  }
}

export async function addNuxtOverrides(
  packageJson: PackageDotJson,
  packageManager: PackageManager,
  nuxtMinVer: SemVer | null,
  forceInstall?: boolean,
) {
  const isPNPM = PNPM.detect();

  const overrides = [
    {
      pkgName: '@vercel/nft',
      pkgVersion: '^0.27.4',
    },
    ...(nuxtMinVer && lt(nuxtMinVer, '3.14.0')
      ? [{ pkgName: 'ofetch', pkgVersion: '^1.4.0' }]
      : []),
  ];

  clack.log.warn(
    `To ensure Sentry can properly instrument your code it needs to add version overrides for some Nuxt dependencies${
      isPNPM ? ` and install ${chalk.cyan('import-in-the-middle')}.` : '.'
    }\n\nFor more info see: ${chalk.underline(
      'https://github.com/getsentry/sentry-javascript/issues/14514',
    )}${
      isPNPM
        ? `\n\nand ${chalk.underline(
            'https://docs.sentry.io/platforms/javascript/guides/nuxt/troubleshooting/#pnpm-dev-cannot-find-package-import-in-the-middle',
          )}`
        : ''
    }`,
  );

  for (const { pkgName, pkgVersion } of overrides) {
    const shouldAddOverride = await askShouldAddPackageOverride(
      pkgName,
      pkgVersion,
    );

    if (shouldAddOverride) {
      await packageManager.addOverride(pkgName, pkgVersion);
    }
  }

  if (PNPM.detect()) {
    // For pnpm, we want to install iitm
    // See: https://docs.sentry.io/platforms/javascript/guides/nuxt/troubleshooting/#pnpm-dev-cannot-find-package-import-in-the-middle
    const iitmAlreadyInstalled = hasPackageInstalled(
      'import-in-the-middle',
      packageJson,
    );
    Sentry.setTag('iitm-already-installed', iitmAlreadyInstalled);

    const shouldInstallIitm = await askShouldInstallPackage(
      'import-in-the-middle',
    );

    if (shouldInstallIitm) {
      await installPackage({
        packageName: 'import-in-the-middle',
        alreadyInstalled: iitmAlreadyInstalled,
        packageManager,
        forceInstall,
      });
    }
  }
}

export async function confirmReadImportDocs(
  deploymentPlatform: DeploymentPlatform | symbol,
) {
  const canImportSentryServerConfigFile =
    deploymentPlatform !== 'vercel' && deploymentPlatform !== 'netlify';

  if (!canImportSentryServerConfigFile) {
    // Nothing to do, users have been set up with automatic top-level-import instead
    return;
  }

  const docsUrl =
    'https://docs.sentry.io/platforms/javascript/guides/nuxt/install/cli-import/#initializing-sentry-with---import';

  clack.log.info(
    `After building your Nuxt app, you need to ${chalk.bold(
      '--import',
    )} the Sentry server config file when running your app.\n\nFor more info, see:\n\n${chalk.underline(
      docsUrl,
    )}`,
  );

  const shouldOpenDocs = await abortIfCancelled(
    clack.confirm({ message: 'Do you want to open the docs?' }),
  );

  Sentry.setTag('init-with-import-docs-opened', shouldOpenDocs);

  if (shouldOpenDocs) {
    // opn throws in environments that don't have a browser (e.g. remote shells) so we just noop here
    const noop = () => {}; // eslint-disable-line @typescript-eslint/no-empty-function
    opn(docsUrl, { wait: false }).then((cp) => cp.on('error', noop), noop);
  }
}
