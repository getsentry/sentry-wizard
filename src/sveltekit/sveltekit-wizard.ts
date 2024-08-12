// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';

import * as Sentry from '@sentry/node';

import {
  abort,
  abortIfCancelled,
  addSentryCliConfig,
  askShouldCreateExamplePage,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import type { WizardOptions } from '../utils/types';
import { createExamplePage } from './sdk-example';
import { createOrMergeSvelteKitFiles, loadSvelteConfig } from './sdk-setup';
import { traceStep, withTelemetry } from '../telemetry';
import { getKitVersionBucket, getSvelteVersionBucket } from './utils';
import { NPM, detectPackageManger } from '../utils/package-manager';

export async function runSvelteKitWizard(
  options: WizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'sveltekit',
    },
    () => runSvelteKitWizardWithTelemetry(options),
  );
}

export async function runSvelteKitWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry SvelteKit Wizard',
    promoCode: options.promoCode,
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, '@sveltejs/kit', 'Sveltekit');

  const kitVersion = getPackageVersion('@sveltejs/kit', packageJson);
  const kitVersionBucket = getKitVersionBucket(kitVersion);
  Sentry.setTag('sveltekit-version', kitVersionBucket);

  if (kitVersionBucket === '0.x') {
    clack.log.warn(
      "It seems you're using a SvelteKit version <1.0.0 which is not supported by Sentry.\nWe recommend upgrading to the latest 1.x version before you continue.",
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

  Sentry.setTag(
    'svelte-version',
    getSvelteVersionBucket(getPackageVersion('svelte', packageJson)),
  );

  const { selectedProject, selfHosted, sentryUrl, authToken } =
    await getOrAskForProjectData(options, 'javascript-sveltekit');

  const sdkAlreadyInstalled = hasPackageInstalled(
    '@sentry/sveltekit',
    packageJson,
  );
  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  await installPackage({
    packageName: '@sentry/sveltekit',
    alreadyInstalled: sdkAlreadyInstalled,
  });

  await addSentryCliConfig({ authToken });

  const svelteConfig = await traceStep('load-svelte-config', loadSvelteConfig);

  try {
    await traceStep('configure-sdk', () =>
      createOrMergeSvelteKitFiles(
        {
          dsn: selectedProject.keys[0].dsn.public,
          org: selectedProject.organization.slug,
          project: selectedProject.slug,
          selfHosted,
          url: sentryUrl,
        },
        svelteConfig,
      ),
    );
  } catch (e: unknown) {
    clack.log.error('Error while setting up the SvelteKit SDK:');
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );
    Sentry.captureException('Error while setting up the SvelteKit SDK');
    await abort('Exiting Wizard');
    return;
  }

  const shouldCreateExamplePage = await askShouldCreateExamplePage(
    '/sentry-example',
  );

  if (shouldCreateExamplePage) {
    try {
      await traceStep('create-example-page', () =>
        createExamplePage(svelteConfig, {
          selfHosted,
          url: sentryUrl,
          orgSlug: selectedProject.organization.slug,
          projectId: selectedProject.id,
        }),
      );
    } catch (e: unknown) {
      clack.log.error('Error while creating an example page to test Sentry:');
      clack.log.info(
        chalk.dim(
          typeof e === 'object' && e != null && 'toString' in e
            ? e.toString()
            : typeof e === 'string'
            ? e
            : 'Unknown error',
        ),
      );
      Sentry.captureException(
        'Error while creating an example Svelte page to test Sentry',
      );
      await abort('Exiting Wizard');
      return;
    }
  }

  clack.outro(buildOutroMessage(shouldCreateExamplePage));
}

function buildOutroMessage(shouldCreateExamplePage: boolean): string {
  const packageManager = detectPackageManger() || NPM;

  let msg = chalk.green('\nSuccessfully installed the Sentry SvelteKit SDK!');

  if (shouldCreateExamplePage) {
    msg += `\n\nYou can validate your setup by starting your dev environment (${chalk.cyan(
      `\`${packageManager.runScriptCommand} dev\``,
    )}) and visiting ${chalk.cyan('"/sentry-example"')}.`;
  }

  msg += `\n\nCheck out the SDK documentation for further configuration:
https://docs.sentry.io/platforms/javascript/guides/sveltekit/`;

  return msg;
}
