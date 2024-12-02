// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import fs from 'fs';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, generateCode, MagicastError } from 'magicast';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { addNuxtModule } from 'magicast/helpers';
import path from 'path';
import {
  getConfigBody,
  getDefaultNuxtConfig,
  getNuxtModuleFallbackTemplate,
  getSentryConfigContents,
} from './templates';
import {
  abort,
  abortIfCancelled,
  askShouldAddPackageOverride,
  askShouldInstallPackage,
  featureSelectionPrompt,
  installPackage,
  isUsingTypeScript,
} from '../utils/clack-utils';
import { traceStep } from '../telemetry';
import { lt, SemVer } from 'semver';
import { PackageManager, PNPM } from '../utils/package-manager';
import { hasPackageInstalled, PackageDotJson } from '../utils/package-json';

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
  options: { org: string; project: string; url: string; selfHosted: boolean },
): Promise<void> {
  try {
    const mod = await loadFile(config);

    addNuxtModule(mod, '@sentry/nuxt/module', 'sentry', {
      sourceMapsUploadOptions: {
        org: options.org,
        project: options.project,
        ...(options.selfHosted && { url: options.url }),
      },
    });
    addNuxtModule(mod, '@sentry/nuxt/module', 'sourcemap', {
      client: 'hidden',
    });

    const { code } = generateCode(mod);

    await fs.promises.writeFile(config, code, { encoding: 'utf-8', flag: 'w' });

    clack.log.success(
      `Added Sentry Nuxt Module to ${chalk.cyan(path.basename(config))}.`,
    );
  } catch (e: unknown) {
    // Cases where users spread options are not covered by magicast,
    // so we fall back to showing how to configure the nuxt config
    // manually.
    if (e instanceof MagicastError) {
      clack.log.warn(
        `Automatic configuration of ${chalk.cyan(
          path.basename(config),
        )} failed, please add the following settings:`,
      );
      // eslint-disable-next-line no-console
      console.log(`\n\n${getNuxtModuleFallbackTemplate(options)}\n\n`);
    } else {
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
) {
  const isPNPM = PNPM.detect();

  const overrides = [
    {
      pkgName: 'nitropack',
      pkgVersion: '~2.9.7',
    },
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
    }\n\nFor more info see: ${chalk.cyan(
      'https://github.com/getsentry/sentry-javascript/issues/14514',
    )}${
      isPNPM
        ? `\n\nand ${chalk.cyan(
            'https://docs.sentry.io/platforms/javascript/guides/nuxt/troubleshooting/#pnpm-resolving-import-in-the-middle-external-package-errors',
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
    // For pnpm, we probably want to install iitm
    // See: https://docs.sentry.io/platforms/javascript/guides/nuxt/troubleshooting/#pnpm-resolving-import-in-the-middle-external-package-errors
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
      });
    }
  }
}
