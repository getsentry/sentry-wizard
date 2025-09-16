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
  showCopyPasteInstructions,
  makeCodeSnippet,
} from '../utils/clack';
import { offerProjectScopedMcpConfig } from '../utils/clack/mcp-config';
import { hasPackageInstalled } from '../utils/package-json';
import { debug } from '../utils/debug';
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
import {
  getManualClientEntryContent,
  getManualRootContent,
  getManualServerEntryContent,
  getManualServerInstrumentContent,
} from './templates';

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

  traceStep('Reveal missing entry files', () => {
    try {
      runReactRouterReveal(typeScriptDetected);
    } catch (e) {
      clack.log.warn(`Could not run 'npx react-router reveal'.
  Please create your entry files manually`);
      debug(e);
    }
  });

  await traceStep('Initialize Sentry on client entry', async () => {
    try {
      await initializeSentryOnEntryClient(
        selectedProject.keys[0].dsn.public,
        featureSelection.performance,
        featureSelection.replay,
        featureSelection.logs,
        typeScriptDetected,
      );
    } catch (e) {
      clack.log.warn(
        `Could not initialize Sentry on client entry automatically.`,
      );

      const clientEntryFilename = `entry.client.${
        typeScriptDetected ? 'tsx' : 'jsx'
      }`;

      const manualClientContent = getManualClientEntryContent(
        selectedProject.keys[0].dsn.public,
        featureSelection.performance,
        featureSelection.replay,
        featureSelection.logs,
      );

      await showCopyPasteInstructions({
        filename: clientEntryFilename,
        codeSnippet: manualClientContent,
        hint: 'This enables error tracking and performance monitoring for your React Router app',
      });

      debug(e);
    }
  });

  await traceStep('Instrument root route', async () => {
    try {
      instrumentRootRoute(typeScriptDetected);
    } catch (e) {
      clack.log.warn(`Could not instrument root route automatically.`);

      const rootFilename = `app/root.${typeScriptDetected ? 'tsx' : 'jsx'}`;
      const manualRootContent = getManualRootContent();

      await showCopyPasteInstructions({
        filename: rootFilename,
        codeSnippet: manualRootContent,
        hint: 'This adds error boundary integration to capture exceptions in your React Router app',
      });

      debug(e);
    }
  });

  await traceStep('Instrument server entry', async () => {
    try {
      await instrumentSentryOnEntryServer(typeScriptDetected);
    } catch (e) {
      clack.log.warn(
        `Could not initialize Sentry on server entry automatically.`,
      );

      const serverEntryFilename = `entry.server.${
        typeScriptDetected ? 'tsx' : 'jsx'
      }`;
      const manualServerContent = getManualServerEntryContent();

      await showCopyPasteInstructions({
        filename: serverEntryFilename,
        codeSnippet: manualServerContent,
        hint: 'This configures server-side request handling and error tracking',
      });

      debug(e);
    }
  });

  await traceStep('Create server instrumentation file', async () => {
    try {
      createServerInstrumentationFile(selectedProject.keys[0].dsn.public, {
        performance: featureSelection.performance,
        replay: featureSelection.replay,
        logs: featureSelection.logs,
      });
    } catch (e) {
      clack.log.warn(
        'Could not create a server instrumentation file automatically.',
      );

      const manualServerInstrumentContent = getManualServerInstrumentContent(
        selectedProject.keys[0].dsn.public,
        featureSelection.performance,
        false, // profiling not enabled by default
      );

      await showCopyPasteInstructions({
        filename: 'instrumentation.server.mjs',
        codeSnippet: manualServerInstrumentContent,
        hint: 'Create the file if it does not exist - this initializes Sentry before your application starts',
      });

      debug(e);
    }
  });

  await traceStep('Insert server instrumentation import', async () => {
    try {
      insertServerInstrumentationFile();
    } catch (e) {
      clack.log.warn(
        'Could not insert server instrumentation import automatically.',
      );

      await showCopyPasteInstructions({
        filename: 'entry.server.tsx',
        codeSnippet: makeCodeSnippet(true, (unchanged, plus) => {
          return `${plus("import './instrument.server.mjs';")}
${unchanged(`import * as Sentry from '@sentry/react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
// ... rest of your imports`)}`;
        }),
        hint: 'Add this import at the very top - this ensures Sentry is initialized before your application starts on the server',
      });

      debug(e);
    }
  });

  await traceStep('Create build plugin env file', async () => {
    try {
      await addDotEnvSentryBuildPluginFile(authToken);
    } catch (e) {
      clack.log.warn(
        'Could not create .env.sentry-build-plugin file. Please create it manually.',
      );
      debug(e);
    }
  });

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
        `Could not configure Vite plugin for sourcemap uploads automatically.`,
      );

      await showCopyPasteInstructions({
        filename: 'vite.config.ts',
        codeSnippet: makeCodeSnippet(true, (unchanged, plus) => {
          return unchanged(`${plus(
            "import { sentryReactRouter } from '@sentry/react-router';",
          )}
import { defineConfig } from 'vite';

export default defineConfig(config => {
  return {
    plugins: [
      // ... your existing plugins
${plus(`      sentryReactRouter({
        org: "${selectedProject.organization.slug}",
        project: "${selectedProject.slug}",
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }, config),`)}
    ],
  };
});`);
        }),
        hint: 'This enables automatic sourcemap uploads during build for better error tracking',
      });

      debug(e);
    }
  });

  // Create example page if requested
  if (createExamplePageSelection) {
    traceStep('Create example page', () => {
      createExamplePage(process.cwd());
    });
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
