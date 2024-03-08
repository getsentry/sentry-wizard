// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  addSentryCliConfig,
  askShouldCreateExamplePage,
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
  runRemixReveal,
  instrumentExpressServer,
} from './sdk-setup';
import { debug } from '../utils/debug';
import { traceStep, withTelemetry } from '../telemetry';
import { isHydrogenApp } from './utils';
import { DEFAULT_URL } from '../../lib/Constants';
import { findFile } from '../utils/ast-utils';
import { configureVitePlugin } from '../sourcemaps/tools/vite';
import { createExamplePage } from './sdk-example';

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

  const { selectedProject, authToken, sentryUrl, selfHosted } =
    await getOrAskForProjectData(options, 'javascript-remix');

  await installPackage({
    packageName: '@sentry/remix',
    alreadyInstalled: hasPackageInstalled('@sentry/remix', packageJson),
  });

  const dsn = selectedProject.keys[0].dsn.public;

  const isTS = isUsingTypeScript();
  const isV2 = isRemixV2(remixConfig, packageJson);
  const viteConfig = findFile('vite.config');

  await addSentryCliConfig({ authToken }, rcCliSetupConfig);

  if (viteConfig) {
    await traceStep(
      'Update vite configuration for sourcemap uploads',
      async () => {
        try {
          await configureVitePlugin({
            orgSlug: selectedProject.organization.slug,
            projectSlug: selectedProject.slug,
            url: sentryUrl,
            selfHosted,
            authToken,
          });
        } catch (e) {
          clack.log
            .warn(`Could not update vite configuration to generate and upload sourcemaps.
    Please update your vite configuration manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/sourcemaps/`);
          debug(e);
        }
      },
    );
  } else {
    await traceStep('Update build script for sourcemap uploads', async () => {
      try {
        await updateBuildScript({
          org: selectedProject.organization.slug,
          project: selectedProject.slug,
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
  }

  await traceStep('Instrument root route', async () => {
    try {
      await instrumentRootRoute(isV2, isTS);
    } catch (e) {
      clack.log.warn(`Could not instrument root route.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  traceStep('Reveal missing entry files', () => {
    try {
      runRemixReveal(isTS);
    } catch (e) {
      clack.log.warn(`Could not run 'npx remix reveal'.
  Please create your entry files manually`);
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

  await traceStep('Instrument custom Express server', async () => {
    try {
      const hasExpressAdapter = hasPackageInstalled(
        '@remix-run/express',
        packageJson,
      );

      if (!hasExpressAdapter) {
        return;
      }

      await instrumentExpressServer();
    } catch (e) {
      clack.log.warn(`Could not instrument custom Express server.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/#custom-express-server`);
      debug(e);
    }
  });

  const shouldCreateExamplePage = await askShouldCreateExamplePage();

  if (shouldCreateExamplePage) {
    await traceStep('Create example page', async () => {
      await createExamplePage({
        isTS,
        selfHosted,
        orgSlug: selectedProject.organization.slug,
        projectId: selectedProject.id,
        url: sentryUrl,
      });
    });
  }

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
