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
import {
  initalizeSentryOnApplicationEntry,
  updateAppConfig,
} from './sdk-setup';
import { addSourcemapEntryToAngularJSON } from './codemods/sourcemaps';
import { runSourcemapsWizard } from '../sourcemaps/sourcemaps-wizard';
import * as Sentry from '@sentry/node';

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
        message: 'Please enter the installed Angular version: ',
        validate(value) {
          if (!value) {
            return 'Please enter the installed Angular version.';
          }

          if (!minVersion(value)) {
            return `Invalid Angular version provided: ${value}`;
          }
        },
      }),
    );
  }

  const installedMinVersion = minVersion(installedAngularVersion) as SemVer;

  const isSupportedAngularVersion = gte(
    installedMinVersion,
    MIN_SUPPORTED_ANGULAR_VERSION,
  );

  if (!isSupportedAngularVersion) {
    clack.log.warn(
      `Angular version ${MIN_SUPPORTED_ANGULAR_VERSION} or higher is required.`,
    );
    clack.log.warn(
      `Please refer to Sentry's version compatibility table for more information: ${chalk.underline(
        'https://docs.sentry.io/platforms/javascript/guides/angular/#angular-version-compatibility',
      )}`,
    );

    return;
  }

  const { selectedProject, authToken, sentryUrl, selfHosted } =
    await getOrAskForProjectData(options, 'javascript-angular');

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

  await traceStep('Update Angular project configuration', async () => {
    await updateAppConfig(installedMinVersion, selectedFeatures.performance);
  });

  await traceStep('Setup for sourcemap uploads', async () => {
    await addSourcemapEntryToAngularJSON();

    if (!options.preSelectedProject) {
      options.preSelectedProject = {
        authToken,
        selfHosted,
        project: {
          organization: {
            id: selectedProject.organization.id,
            name: selectedProject.organization.name,
            slug: selectedProject.organization.slug,
          },
          id: selectedProject.id,
          slug: selectedProject.slug,
          keys: [
            {
              dsn: {
                public: dsn,
              },
            },
          ],
        },
      };

      options.url = sentryUrl;
    }

    await runSourcemapsWizard(options, 'angular');
  });

  await traceStep('Run Prettier', async () => {
    await runPrettierIfInstalled();
  });

  clack.outro(`
    ${chalk.green(
    'Sentry has been successfully configured for your Angular project.',
  )}`);
}
