// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  addSentryCliConfig,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  rcCliSetupConfig,
} from '../utils/clack-utils';
import { hasPackageInstalled } from '../utils/package-json';
import { WizardOptions } from '../utils/types';
import {
  initializeSentryOnEntryClient,
  initializeSentryOnEntryServer,
  updateBuildScript,
  instrumentRootRoute,
  isRemixV2,
  loadRemixConfig,
} from './sdk-setup';
import { debug } from '../utils/debug';
import { traceStep, withTelemetry } from '../telemetry';
import { isHydrogenApp } from './utils';
import { DEFAULT_URL } from '../../lib/Constants';

export async function runRemixWizard(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'remix',
    },
    () => runRemixWizardWithTelemetry(options),
  );
}

async function runRemixWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Remix Wizard',
    promoCode: options.promoCode,
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const remixConfig = await loadRemixConfig();
  const packageJson = await getPackageDotJson();

  // We expect `@remix-run/dev` to be installed for every Remix project
  await ensurePackageIsInstalled(packageJson, '@remix-run/dev', 'Remix');

  const { selectedProject, authToken, sentryUrl } =
    await getOrAskForProjectData(options, 'javascript-remix');

  await installPackage({
    packageName: '@sentry/remix',
    alreadyInstalled: hasPackageInstalled('@sentry/remix', packageJson),
  });

  const dsn = selectedProject.keys[0].dsn.public;

  const isTS = isUsingTypeScript();
  const isV2 = isRemixV2(remixConfig, packageJson);

  await addSentryCliConfig({ authToken }, rcCliSetupConfig);

  await traceStep('Update build script for sourcemap uploads', async () => {
    try {
      await updateBuildScript({
        org: selectedProject.organization.slug,
        project: selectedProject.name,
        url: sentryUrl === DEFAULT_URL ? undefined : sentryUrl,
        isHydrogen: isHydrogenApp(packageJson),
      });
    } catch (e) {
      clack.log
        .warn(`Could not update build script to generate and upload sourcemaps.
  Please update your build script manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/sourcemaps/`);
      debug(e);
    }
  });

  await traceStep('Instrument root route', async () => {
    try {
      await instrumentRootRoute(isV2, isTS);
    } catch (e) {
      clack.log.warn(`Could not instrument root route.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  await traceStep('Initialize Sentry on client entry', async () => {
    try {
      await initializeSentryOnEntryClient(dsn, isTS);
    } catch (e) {
      clack.log.warn(`Could not initialize Sentry on client entry.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  await traceStep('Initialize Sentry on server entry', async () => {
    try {
      await initializeSentryOnEntryServer(dsn, isV2, isTS);
    } catch (e) {
      clack.log.warn(`Could not initialize Sentry on server entry.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  clack.outro(`
${chalk.green(
  'Sentry has been successfully configured for your Remix project.',
)}

${chalk.cyan('You can now deploy your project to see Sentry in action.')}

${chalk.cyan(
  `To learn more about how to use Sentry with Remix, visit our documentation:
https://docs.sentry.io/platforms/javascript/guides/remix/`,
)}`);
}
