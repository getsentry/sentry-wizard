// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import type { WizardOptions } from '../utils/types';
import { withTelemetry, traceStep } from '../telemetry';
import { configureVitePlugin } from '../sourcemaps/tools/vite';
import {
  askShouldCreateExamplePage,
  confirmContinueIfNoOrDirtyGitRepo,
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  isUsingTypeScript,
  printWelcome,
  installPackage,
  addDotEnvSentryBuildPluginFile,
} from '../utils/clack';
import { offerProjectScopedMcpConfig } from '../utils/clack/mcp-config';
import { hasPackageInstalled } from '../utils/package-json';
import { createExamplePage } from './sdk-example';
import {
  isReactRouterV7,
  runReactRouterReveal,
  initializeSentryOnEntryClient,
  instrumentRootRoute,
  createServerInstrumentationFile,
  insertServerInstrumentationFile,
  instrumentSentryOnEntryServer,
} from './sdk-setup';

export async function runReactRouterWizard(
  options: WizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'reactRouter',
      wizardOptions: options,
    },
    () => runReactRouterWizardWithTelemetry(options),
  );
}

async function runReactRouterWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry React Router Wizard',
    promoCode: options.promoCode,
  });

  const packageJson = await getPackageDotJson();

  if (!packageJson) {
    clack.log.error(
      'Could not find a package.json file in the current directory',
    );
    return;
  }

  const typeScriptDetected = isUsingTypeScript();

  if (!isReactRouterV7(packageJson)) {
    clack.log.error(
      'This wizard requires React Router v7. Please upgrade your React Router version.',
    );
    return;
  }

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

  const sentryAlreadyInstalled = hasPackageInstalled(
    '@sentry/react-router',
    packageJson,
  );

  const { selectedProject, authToken, selfHosted, sentryUrl } =
    await getOrAskForProjectData(options, 'javascript-react-router');

  // Install @sentry/react-router package first (this may prompt for package manager selection)
  await installPackage({
    packageName: '@sentry/react-router',
    alreadyInstalled: sentryAlreadyInstalled,
  });

  const featureSelection = await featureSelectionPrompt([
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
        'Session Replay',
      )} to get a video-like reproduction of errors during a user session?`,
      enabledHint: 'recommended, but increases bundle size',
    },
    {
      id: 'logs',
      prompt: `Do you want to enable ${chalk.bold(
        'Logs',
      )} to send your application logs to Sentry?`,
      enabledHint: 'recommended',
    },
  ]);

  const createExamplePageSelection = await askShouldCreateExamplePage();

  // Generate entry files if they don't exist
  runReactRouterReveal(typeScriptDetected);

  // Initialize Sentry on entry client
  initializeSentryOnEntryClient(
    selectedProject.keys[0].dsn.public,
    featureSelection.performance,
    featureSelection.replay,
    featureSelection.logs,
    typeScriptDetected,
  );

  // Add error boundary to root route
  instrumentRootRoute(typeScriptDetected);

  // Instrument entry server
  instrumentSentryOnEntryServer(typeScriptDetected);

  // Create server instrumentation file
  createServerInstrumentationFile(selectedProject.keys[0].dsn.public, {
    performance: featureSelection.performance,
    replay: featureSelection.replay,
    logs: featureSelection.logs,
  });

  // Insert instrumentation import into custom server if it exists
  insertServerInstrumentationFile();

  // Create build plugin env file
  await addDotEnvSentryBuildPluginFile(authToken);

  // Configure Vite plugin for sourcemap uploads
  await traceStep('Configure Vite plugin for sourcemap uploads', async () => {
    try {
      await configureVitePlugin({
        orgSlug: selectedProject.organization.slug,
        projectSlug: selectedProject.slug,
        url: sentryUrl,
        selfHosted,
        authToken,
      });
    } catch (e) {
      clack.log.warn(
        `Could not configure Vite plugin for sourcemap uploads. Please configure it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/react-router/sourcemaps/`,
      );
    }
  });

  // Create example page if requested
  if (createExamplePageSelection) {
    createExamplePage(process.cwd());
  }

  // Offer optional project-scoped MCP config for Sentry with org and project scope
  await offerProjectScopedMcpConfig(
    selectedProject.organization.slug,
    selectedProject.slug,
  );

  const dashboardUrl = selfHosted
    ? `${sentryUrl}organizations/${selectedProject.organization.slug}/projects/${selectedProject.slug}/`
    : `https://sentry.io/organizations/${selectedProject.organization.slug}/projects/${selectedProject.slug}/`;

  clack.outro(
    `${chalk.green('Successfully installed the Sentry React Router SDK!')}${
      createExamplePageSelection
        ? `\n\nYou can validate your setup by visiting ${chalk.cyan(
            '"/sentry-example-page"',
          )} in your application.`
        : ''
    }

${chalk.cyan('Next Steps:')}${
      !createExamplePageSelection
        ? '\n  1. Create an error in your app to test error reporting'
        : '\n  1. Visit the /sentry-example-page route in your app to test error reporting'
    }
  2. Check out the SDK documentation: https://docs.sentry.io/platforms/javascript/guides/react-router/
  3. View your errors in the Sentry dashboard: ${dashboardUrl}

${chalk.dim(
  'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-javascript/issues',
)}`,
  );
}
