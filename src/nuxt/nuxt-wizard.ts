// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import { lt, minVersion } from 'semver';
import { traceStep, withTelemetry } from '../telemetry';
import {
  abort,
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
  askShouldCreateExampleComponent,
  askShouldCreateExamplePage,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  printWelcome,
  runPrettierIfInstalled,
} from '../utils/clack';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import type { WizardOptions } from '../utils/types';
import {
  createExampleComponent,
  createExamplePage,
  supportsExamplePage,
} from './sdk-example';
import {
  addNuxtOverrides,
  addSDKModule,
  askDeploymentPlatform,
  confirmReadImportDocs,
  createConfigFiles,
  getNuxtConfig,
} from './sdk-setup';
import { isNuxtV4 } from './utils';

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
  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry Nuxt Wizard',
    promoCode,
    telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, 'nuxt', 'Nuxt');

  const nuxtVersion = getPackageVersion('nuxt', packageJson);
  Sentry.setTag('nuxt-version', nuxtVersion);

  const minVer = minVersion(nuxtVersion || '0.0.0');

  if (!nuxtVersion || !minVer || lt(minVer, '3.7.0')) {
    clack.log.warn(
      "It seems you're using a Nuxt version <3.7.0 which is not supported by Sentry.\nWe recommend upgrading to the latest version before you continue.",
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

  const packageManager = await getPackageManager();

  await addNuxtOverrides(packageJson, packageManager, minVer, forceInstall);

  const sdkAlreadyInstalled = hasPackageInstalled('@sentry/nuxt', packageJson);
  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  await installPackage({
    packageName: '@sentry/nuxt@^9',
    alreadyInstalled: sdkAlreadyInstalled,
    packageManager,
    forceInstall,
  });

  await addDotEnvSentryBuildPluginFile(authToken);

  const nuxtConfig = await traceStep('load-nuxt-config', getNuxtConfig);

  const projectData = {
    org: selectedProject.organization.slug,
    project: selectedProject.slug,
    projectId: selectedProject.id,
    url: sentryUrl,
    selfHosted,
  };

  const deploymentPlatform = await askDeploymentPlatform();
  Sentry.setTag('deployment-platform', deploymentPlatform);

  await traceStep('configure-sdk', async () => {
    await addSDKModule(nuxtConfig, projectData, deploymentPlatform);
    await createConfigFiles(selectedProject.keys[0].dsn.public);
  });

  let shouldCreateExamplePage = false;
  let shouldCreateExampleButton = false;

  const isV4 = await isNuxtV4(nuxtConfig, nuxtVersion);
  const canCreateExamplePage = await supportsExamplePage(isV4);
  Sentry.setTag('supports-example-page-creation', canCreateExamplePage);

  if (canCreateExamplePage) {
    shouldCreateExamplePage = await askShouldCreateExamplePage();

    if (shouldCreateExamplePage) {
      await traceStep('create-example-page', async () =>
        createExamplePage(isV4, projectData),
      );
    }
  } else {
    shouldCreateExampleButton = await askShouldCreateExampleComponent();

    if (shouldCreateExampleButton) {
      await traceStep('create-example-component', async () =>
        createExampleComponent(isV4),
      );
    }
  }

  await runPrettierIfInstalled({ cwd: undefined });

  await confirmReadImportDocs(deploymentPlatform);

  clack.outro(
    buildOutroMessage(shouldCreateExamplePage, shouldCreateExampleButton),
  );
}

function buildOutroMessage(
  shouldCreateExamplePage: boolean,
  shouldCreateExampleButton: boolean,
): string {
  let msg = chalk.green('\nSuccessfully installed the Sentry Nuxt SDK!');

  if (shouldCreateExamplePage) {
    msg += `\n\nYou can validate your setup by visiting ${chalk.cyan(
      '"/sentry-example-page"',
    )}.`;
  }
  if (shouldCreateExampleButton) {
    msg += `\n\nYou can validate your setup by adding the ${chalk.cyan(
      '`SentryExampleButton`',
    )} component to a page and triggering it.`;
  }

  msg += `\n\nCheck out the SDK documentation for further configuration: ${chalk.underline(
    'https://docs.sentry.io/platforms/javascript/guides/nuxt/',
  )}`;

  return msg;
}
