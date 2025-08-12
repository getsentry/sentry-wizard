// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

import pc from 'picocolors';
import type { WizardOptions } from '../utils/types';
import { traceStep, withTelemetry } from '../telemetry';
import {
  abortIfCancelled,
  askShouldCreateExampleComponent,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
  runPrettierIfInstalled,
  abort,
} from '../utils/clack';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { gte, minVersion, SemVer } from 'semver';

import * as Sentry from '@sentry/node';
import { initializeSentryOnApplicationEntry } from './sdk-setup';
import { updateAppConfig } from './sdk-setup';
import { runSourcemapsWizard } from '../sourcemaps/sourcemaps-wizard';
import { addSourcemapEntryToAngularJSON } from './codemods/sourcemaps';
import { createExampleComponent } from './example-component';

const MIN_SUPPORTED_ANGULAR_VERSION = '14.0.0';
const MIN_SUPPORTED_WIZARD_ANGULAR_VERSION = '17.0.0';

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

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, '@angular/core', 'Angular');

  let installedAngularVersion = getPackageVersion('@angular/core', packageJson);

  if (!installedAngularVersion) {
    clack.log.warn('Could not determine installed Angular version.');

    installedAngularVersion = await abortIfCancelled(
      clack.text({
        message: `Please enter your installed Angular major version (e.g. ${pc.cyan(
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

  const sdkSupportsAngularVersion = gte(
    installedMinVersion,
    MIN_SUPPORTED_ANGULAR_VERSION,
  );

  const wizardSupportsAngularVersion = gte(
    installedMinVersion,
    MIN_SUPPORTED_WIZARD_ANGULAR_VERSION,
  );

  if (!sdkSupportsAngularVersion) {
    Sentry.setTag('angular-version-compatible', false);

    clack.log.warn(
      `Angular version ${pc.cyan(
        MIN_SUPPORTED_ANGULAR_VERSION,
      )} or higher is required for the Sentry SDK.`,
    );
    clack.log.warn(
      `Please refer to Sentry's version compatibility table for more information:

${pc.underline(
  'https://docs.sentry.io/platforms/javascript/guides/angular/#angular-version-compatibility',
)}
`,
    );

    return abort('Exiting the wizard.', 0);
  }

  if (!wizardSupportsAngularVersion) {
    Sentry.setTag('angular-wizard-version-compatible', false);

    clack.log.warn(
      `The Sentry Angular Wizard requires Angular version ${pc.cyan(
        MIN_SUPPORTED_WIZARD_ANGULAR_VERSION,
      )} or higher.`,
    );
    clack.log.warn(
      `Your Angular version (${installedAngularVersion}) is compatible with the Sentry SDK but you need to set it up manually by following our documentation:

${pc.underline('https://docs.sentry.io/platforms/javascript/guides/angular')}

Apologies for the inconvenience!`,
    );

    return abort('Exiting the wizard.', 0);
  }

  const { selectedProject, authToken, sentryUrl, selfHosted } =
    await getOrAskForProjectData(options, 'javascript-angular');

  const dsn = selectedProject.keys[0].dsn.public;

  const sdkAlreadyInstalled = hasPackageInstalled(
    '@sentry/angular',
    packageJson,
  );

  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  await installPackage({
    packageName: '@sentry/angular@^10',
    packageNameDisplayLabel: '@sentry/angular',
    alreadyInstalled: sdkAlreadyInstalled,
  });

  const selectedFeatures = await featureSelectionPrompt([
    {
      id: 'performance',
      prompt: `Do you want to enable ${pc.bold(
        'Tracing',
      )} to track the performance of your application?`,
      enabledHint: 'recommended',
    },
    {
      id: 'replay',
      prompt: `Do you want to enable ${pc.bold(
        'Sentry Session Replay',
      )} to get a video-like reproduction of errors during a user session?`,
      enabledHint: 'recommended, but increases bundle size',
    },
    {
      id: 'logs',
      prompt: `Do you want to enable ${pc.bold(
        'Logs',
      )} to send your application logs to Sentry?`,
      enabledHint: 'recommended',
    },
  ] as const);

  await traceStep(
    'Initialize Sentry on Angular application entry point',
    async () => {
      await initializeSentryOnApplicationEntry(dsn, selectedFeatures);
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

  const shouldCreateExampleComponent = await askShouldCreateExampleComponent();

  Sentry.setTag('create-example-component', shouldCreateExampleComponent);

  if (shouldCreateExampleComponent) {
    await traceStep(
      'create-example-component',
      async () =>
        await createExampleComponent({
          url: sentryUrl,
          orgSlug: selectedProject.organization.slug,
          projectId: selectedProject.id,
        }),
    );
  }

  await traceStep('Run Prettier', async () => {
    await runPrettierIfInstalled({ cwd: undefined });
  });

  clack.outro(buildOutroMessage(shouldCreateExampleComponent));
}

export function buildOutroMessage(createdExampleComponent: boolean): string {
  let msg = pc.green('\nSuccessfully installed the Sentry Angular SDK!');

  if (createdExampleComponent) {
    msg += `\n\nYou can validate your setup by starting your dev environment (${pc.cyan(
      'ng serve',
    )}) and throwing an error in the example component.`;
  }

  msg += `\n\nCheck out the SDK documentation for further configuration:
https://docs.sentry.io/platforms/javascript/guides/angular/`;

  return msg;
}
