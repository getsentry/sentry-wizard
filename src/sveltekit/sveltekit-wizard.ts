// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';

import * as Sentry from '@sentry/node';

import { traceStep, withTelemetry } from '../telemetry';
import {
  abort,
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
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
import { NPM } from '../utils/package-manager';
import type { WizardOptions } from '../utils/types';
import { offerProjectScopedMcpConfig } from '../utils/clack/mcp-config';
import { createExamplePage } from './sdk-example';
import { createOrMergeSvelteKitFiles } from './sdk-setup/setup';
import { loadSvelteConfig } from './sdk-setup/svelte-config';
import { getKitVersionBucket, getSvelteVersionBucket } from './utils';

export async function runSvelteKitWizard(
  options: WizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'sveltekit',
      wizardOptions: options,
    },
    () => runSvelteKitWizardWithTelemetry(options),
  );
}

export async function runSvelteKitWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry SvelteKit Wizard',
    promoCode,
    telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

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

  if (kitVersionBucket !== '>=2.31.0') {
    clack.log.warn(
      `It seems you're using a SvelteKit version ${chalk.cyan(
        '<2.31.0',
      )} (detected ${chalk.cyan(
        kitVersion ?? 'unknown',
      )}). We recommend upgrading SvelteKit to version ${chalk.cyan(
        '>=2.31.0',
      )} to use SvelteKit's builtin observability:
${chalk.cyan('https://svelte.dev/docs/kit/observability')}
Sentry works best with SvelteKit's builtin observability.

If you prefer, you can stay on your current version and use Sentry SDK without SvelteKit's builtin observability.`,
    );

    const shouldContinue = await abortIfCancelled(
      clack.select({
        message: 'Do you want to continue anyway?',
        options: [
          {
            label: "No, I'll upgrade SvelteKit first",
            hint: 'Recommended',
            value: false,
          },
          {
            label: "I'm already on SvelteKit >=2.31.0",
            hint: 'Sorry, my bad!',
            value: true,
          },
          {
            label: 'Yes, continue',
            hint: 'No Problem!',
            value: true,
          },
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
    packageName: '@sentry/sveltekit@^10',
    packageNameDisplayLabel: '@sentry/sveltekit',
    alreadyInstalled: sdkAlreadyInstalled,
    forceInstall,
  });

  await addDotEnvSentryBuildPluginFile(authToken);

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
        kitVersionBucket,
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
    '/sentry-example-page',
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

  await runPrettierIfInstalled({ cwd: undefined });

  // Offer optional project-scoped MCP config for Sentry with org and project scope
  await offerProjectScopedMcpConfig(
    selectedProject.organization.slug,
    selectedProject.slug,
  );

  clack.outro(await buildOutroMessage(shouldCreateExamplePage));
}

async function buildOutroMessage(
  shouldCreateExamplePage: boolean,
): Promise<string> {
  const packageManager = await getPackageManager(NPM);

  let msg = chalk.green('\nSuccessfully installed the Sentry SvelteKit SDK!');

  if (shouldCreateExamplePage) {
    msg += `\n\nYou can validate your setup by starting your dev environment (${chalk.cyan(
      `\`${packageManager.runScriptCommand} dev\``,
    )}) and visiting ${chalk.cyan('"/sentry-example-page"')}.`;
  }

  msg += `\n\nCheck out the SDK documentation for further configuration:
https://docs.sentry.io/platforms/javascript/guides/sveltekit/`;

  return msg;
}
