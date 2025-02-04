/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

import chalk from 'chalk';
import type { WizardOptions } from '../utils/types';
import { traceStep, withTelemetry } from '../telemetry';
import {
  abortIfCancelled,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
  runPrettierIfInstalled,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { gte, minVersion, SemVer } from 'semver';

import * as Sentry from '@sentry/node';
import { initalizeSentryOnApplicationEntry } from './sdk-setup';
import { updateAppConfig } from './sdk-setup';

const MIN_SUPPORTED_ANGULAR_VERSION = '14.0.0';

export async function runAngularWizard(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'angular',
      wizardOptions: options,
    },
    () => runAngularWizardWithTelemetry(options),
  );
}

async function runAngularWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Angular Wizard',
    promoCode: options.promoCode,
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, '@angular/core', 'Angular');

  let installedAngularVersion = getPackageVersion('@angular/core', packageJson);

  if (!installedAngularVersion) {
    clack.log.warn('Could not determine installed Angular version.');

    installedAngularVersion = await abortIfCancelled(
      clack.text({
        message: `Please enter your installed Angular major version (e.g. ${chalk.cyan(
          '18',
        )} for Angular 18)`,
        validate(value) {
          if (!value) {
            return 'Angular version is required';
          }

          try {
            if (!minVersion(value)) {
              return `Invalid Angular version provided: ${value}`;
            }
          } catch (error) {
            return `Invalid Angular version provided: ${value}`;
          }
        },
      }),
    );
  }

  Sentry.setTag('angular-version', installedAngularVersion);

  const installedMinVersion = minVersion(installedAngularVersion) as SemVer;

  const isSupportedAngularVersion = gte(
    installedMinVersion,
    MIN_SUPPORTED_ANGULAR_VERSION,
  );

  if (!isSupportedAngularVersion) {
    clack.log.warn(
      `Angular version ${chalk.cyan(
        MIN_SUPPORTED_ANGULAR_VERSION,
      )} or higher is required.`,
    );
    clack.log.warn(
      `Please refer to Sentry's version compatibility table for more information:
${chalk.underline(
  'https://docs.sentry.io/platforms/javascript/guides/angular/#angular-version-compatibility',
)}`,
    );

    return;
  }

  const { selectedProject } = await getOrAskForProjectData(
    options,
    'javascript-angular',
  );

  const sdkAlreadyInstalled = hasPackageInstalled(
    '@sentry/angular',
    packageJson,
  );

  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  await installPackage({
    packageName: '@sentry/angular@^8',
    packageNameDisplayLabel: '@sentry/angular',
    alreadyInstalled: sdkAlreadyInstalled,
  });

  const dsn = selectedProject.keys[0].dsn.public;

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

  await traceStep(
    'Initialize Sentry on Angular application entry point',
    async () => {
      await initalizeSentryOnApplicationEntry(dsn, selectedFeatures);
    },
  );

  await traceStep('Run Prettier', async () => {
    await runPrettierIfInstalled();
  });

  clack.outro(`
    ${chalk.green(
      'Sentry has been successfully configured for your Angular project.',
    )}`);
  await traceStep('Update Angular project configuration', async () => {
    await updateAppConfig(installedMinVersion, selectedFeatures.performance);
  });
}
