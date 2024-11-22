// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import { lt, minVersion } from 'semver';
import type { WizardOptions } from '../utils/types';
import { traceStep, withTelemetry } from '../telemetry';
import {
  abort,
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { addSDKModule, getNuxtConfig, createConfigFiles } from './sdk-setup';

export function runNuxtWizard(options: WizardOptions) {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'nuxt',
      wizardOptions: options,
    },
    () => runNuxtWizardWithTelemetry(options),
  );
}

export async function runNuxtWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Nuxt Wizard',
    promoCode: options.promoCode,
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, 'nuxt', 'Nuxt');

  const nuxtVersion = getPackageVersion('nuxt', packageJson);
  Sentry.setTag('nuxt-version', nuxtVersion);

  const minVer = minVersion(nuxtVersion || 'none');

  if (!nuxtVersion || !minVer || lt(minVer, '3.13.2')) {
    clack.log.warn(
      "It seems you're using a Nuxt version <3.13.2 which is not supported by Sentry.\nWe recommend upgrading to the latest version before you continue.",
    );
    const shouldContinue = await abortIfCancelled(
      clack.select({
        message: 'Do you want to continue anyway?',
        options: [
          {
            label: 'Yes, continue',
            hint: 'The SDK might not work correctly',
            value: true,
          },
          { label: "No, I'll upgrade first", value: false },
        ],
      }),
    );
    if (!shouldContinue) {
      await abort('Exiting Wizard', 0);
      return;
    }
  }

  const { authToken, selectedProject, selfHosted, sentryUrl } =
    await getOrAskForProjectData(options, 'javascript-nuxt');

  const sdkAlreadyInstalled = hasPackageInstalled('@sentry/nuxt', packageJson);
  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  await installPackage({
    packageName: '@sentry/nuxt',
    alreadyInstalled: sdkAlreadyInstalled,
  });

  await addDotEnvSentryBuildPluginFile(authToken);

  const nuxtConfig = await traceStep('load-nuxt-config', getNuxtConfig);

  await traceStep('configure-sdk', async () => {
    await addSDKModule(nuxtConfig, {
      org: selectedProject.organization.slug,
      project: selectedProject.slug,
      url: selfHosted ? sentryUrl : undefined,
    });

    await createConfigFiles(selectedProject.keys[0].dsn.public);
  });
}
