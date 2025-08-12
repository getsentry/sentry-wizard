// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import pc from 'picocolors';

import { DEFAULT_URL } from '../../lib/Constants';
import { configureVitePlugin } from '../sourcemaps/tools/vite';
import { traceStep, withTelemetry } from '../telemetry';
import { findFile } from '../utils/ast-utils';
import {
  addSentryCliConfig,
  askShouldCreateExamplePage,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  rcCliSetupConfig,
  runPrettierIfInstalled,
} from '../utils/clack';
import { debug } from '../utils/debug';
import { hasPackageInstalled } from '../utils/package-json';
import type { WizardOptions } from '../utils/types';
import { createExamplePage } from './sdk-example';
import {
  createServerInstrumentationFile,
  initializeSentryOnEntryClient,
  insertServerInstrumentationFile,
  instrumentRootRoute,
  instrumentSentryOnEntryServer,
  isRemixV2,
  runRemixReveal,
  updateBuildScript,
  updateStartScript,
} from './sdk-setup';
import { isHydrogenApp } from './utils';

export async function runRemixWizard(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'remix',
      wizardOptions: options,
    },
    () => runRemixWizardWithTelemetry(options),
  );
}

async function runRemixWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry Remix Wizard',
    promoCode,
    telemetryEnabled,
  });

  const packageJson = await getPackageDotJson();

  if (!isRemixV2(packageJson)) {
    clack.log.error(
      `Sentry only supports Remix v2 and above. Please upgrade your Remix version to use Sentry.`,
    );
    return;
  }

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

  // We expect `@remix-run/dev` to be installed for every Remix project
  await ensurePackageIsInstalled(packageJson, '@remix-run/dev', 'Remix');

  const { selectedProject, authToken, sentryUrl, selfHosted } =
    await getOrAskForProjectData(options, 'javascript-remix');

  await installPackage({
    packageName: '@sentry/remix@^10',
    packageNameDisplayLabel: '@sentry/remix',
    alreadyInstalled: hasPackageInstalled('@sentry/remix', packageJson),
    forceInstall,
  });

  const dsn = selectedProject.keys[0].dsn.public;

  const isTS = isUsingTypeScript();
  const viteConfig = findFile('vite.config');
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
        'Session Replay',
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

        await addSentryCliConfig({ authToken }, rcCliSetupConfig);
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
      await instrumentRootRoute(isTS);
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
      await initializeSentryOnEntryClient(dsn, isTS, selectedFeatures);
    } catch (e) {
      clack.log.warn(`Could not initialize Sentry on client entry.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  let instrumentationFile = '';

  await traceStep('Create server instrumentation file', async () => {
    try {
      instrumentationFile = await createServerInstrumentationFile(
        dsn,
        selectedFeatures,
      );
    } catch (e) {
      clack.log.warn(
        'Could not create a server instrumentation file. Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/',
      );
      debug(e);
    }
  });

  let serverFileInstrumented = false;

  await traceStep(
    'Create server instrumentation file and import it',
    async () => {
      try {
        serverFileInstrumented = await insertServerInstrumentationFile(
          dsn,
          selectedFeatures,
        );
      } catch (e) {
        clack.log.warn(
          'Could not create a server instrumentation file. Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/',
        );
        debug(e);
      }
    },
  );

  if (!serverFileInstrumented && instrumentationFile) {
    await traceStep(
      'Update `start` script to import instrumentation file.',
      async () => {
        try {
          await updateStartScript(instrumentationFile);
        } catch (e) {
          clack.log
            .warn(`Could not automatically add Sentry initialization to server entry.
    Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
          debug(e);
        }
      },
    );
  }

  await traceStep('Instrument server `handleError`', async () => {
    try {
      await instrumentSentryOnEntryServer(isTS);
    } catch (e) {
      clack.log.warn(`Could not initialize Sentry on server entry.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
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

  await runPrettierIfInstalled({ cwd: undefined });

  clack.outro(`
${pc.green('Sentry has been successfully configured for your Remix project.')}

${pc.cyan('You can now deploy your project to see Sentry in action.')}

${pc.cyan(
  `To learn more about how to use Sentry with Remix, visit our documentation:
https://docs.sentry.io/platforms/javascript/guides/remix/`,
)}`);
}
