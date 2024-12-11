/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

import chalk from 'chalk';
import type { WizardOptions } from '../utils/types';
import { traceStep, withTelemetry } from '../telemetry';
import {
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { gte, minVersion } from 'semver';
import { initalizeSentryOnAppModule, updateAppConfig } from './sdk-setup';
import { addSourcemapEntryToAngularJSON } from './codemods/sourcemaps';
import { runSourcemapsWizard } from '../sourcemaps/sourcemaps-wizard';

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
    wizardName: 'Sentry Remix Wizard',
    promoCode: options.promoCode,
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, '@angular/core', 'Angular');

  const installedAngularVersion = getPackageVersion(
    '@angular/core',
    packageJson,
  );

  if (!installedAngularVersion) {
    clack.log.warn('Could not determine installed Angular version.');

    return;
  }

  const installedMinVersion = minVersion(installedAngularVersion);

  if (!installedMinVersion) {
    clack.log.warn('Could not determine minimum Angular version.');

    return;
  }

  const isSupportedAngularVersion = gte(
    installedMinVersion,
    MIN_SUPPORTED_ANGULAR_VERSION,
  );

  if (!isSupportedAngularVersion) {
    clack.log.warn(
      `Angular version ${MIN_SUPPORTED_ANGULAR_VERSION} or higher is required.`,
    );

    return;
  }

  const { selectedProject, authToken, sentryUrl, selfHosted } =
    await getOrAskForProjectData(options, 'javascript-angular');

  await installPackage({
    packageName: '@sentry/angular@^8',
    packageNameDisplayLabel: '@sentry/angular',
    alreadyInstalled: hasPackageInstalled('@sentry/angular', packageJson),
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

  await traceStep('Inject Sentry to Angular app config', async () => {
    await initalizeSentryOnAppModule(dsn, selectedFeatures);
  });

  await traceStep('Update Angular project configuration', async () => {
    await updateAppConfig(installedMinVersion, selectedFeatures.performance);
  });

  await traceStep('Setup for sourcemap uploads', async () => {
    addSourcemapEntryToAngularJSON();

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

  clack.log.success(
    'Sentry has been successfully configured for your Angular project',
  );
}
