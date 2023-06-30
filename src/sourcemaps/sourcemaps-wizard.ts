// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';

import {
  abortIfCancelled,
  askForProjectSelection,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  printWelcome,
} from '../utils/clack-utils';
import { isUnicodeSupported } from '../utils/vendor/is-unicorn-supported';
import { SourceMapUploadToolConfigurationOptions } from './tools/types';
import { configureVitePlugin } from './tools/vite';
import { configureSentryCLI } from './tools/sentry-cli';
import { configureWebPackPlugin } from './tools/webpack';
import { configureTscSourcemapGenerationFlow } from './tools/tsc';
import { configureRollupPlugin } from './tools/rollup';
import { configureEsbuildPlugin } from './tools/esbuild';

interface SourceMapsWizardOptions {
  promoCode?: string;
}

type SupportedTools =
  | 'webpack'
  | 'vite'
  | 'rollup'
  | 'esbuild'
  | 'tsc'
  | 'sentry-cli';

export async function runSourcemapsWizard(
  options: SourceMapsWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Source Maps Upload Configuration Wizard',
    message:
      'This wizard will help you upload source maps to Sentry as part of your build.\nThank you for using Sentry :)\n\n(This setup wizard sends telemetry data and crash reports to Sentry.\nYou can turn this off by running the wizard with the `--disable-telemetry` flag.)',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const { url: sentryUrl, selfHosted } = await askForSelfHosted();

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: options.promoCode,
    url: sentryUrl,
  });

  const selectedProject = await askForProjectSelection(projects);

  const selectedTool = await askForUsedBundlerTool();

  Sentry.setTag('selected-tool', selectedTool);

  await startToolSetupFlow(selectedTool, {
    selfHosted,
    orgSlug: selectedProject.organization.slug,
    projectSlug: selectedProject.slug,
    url: sentryUrl,
    authToken: apiKeys.token,
  });

  clack.log.step(
    'Add the Sentry authentication token as an environment variable to your CI setup:',
  );

  // Intentially logging directly to console here so that the code can be copied/pasted directly
  // eslint-disable-next-line no-console
  console.log(
    chalk.greenBright(`
SENTRY_AUTH_TOKEN=${apiKeys.token}
`),
  );

  clack.log.warn(
    chalk.yellow('DO NOT commit this auth token to your repository!'),
  );

  const addedEnvVarToCI = await abortIfCancelled(
    clack.select({
      message: 'Did you configure CI as shown above?',
      options: [
        { label: 'Yes, continue!', value: true },
        {
          label: "I'll do it later...",
          value: false,
          hint: chalk.yellow(
            'You need to set the auth token to upload source maps in CI',
          ),
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('added-env-var-to-ci', addedEnvVarToCI);

  if (!addedEnvVarToCI) {
    clack.log.info("Don't forget! :)");
  }

  const arrow = isUnicodeSupported() ? '→' : '->';

  clack.outro(`${chalk.green("That's it - everything is set up!")}

   ${chalk.cyan(`Validate your setup with the following Steps:

   1. Build your application in ${chalk.bold('production mode')}.
      ${chalk.gray(
        `${arrow} You should see source map upload logs in your console.`,
      )}
   2. Run your application and throw a test error.
      ${chalk.gray(`${arrow} The error should be visible in Sentry.`)}
   3. Open the error in Sentry and verify that it's source-mapped.
      ${chalk.gray(
        `${arrow} The stack trace should show your original source code.`,
      )}
   `)}
   ${chalk.dim(
     `If you encounter any issues, please refer to the Troubleshooting Guide:
   https://docs.sentry.io/platforms/javascript/sourcemaps/troubleshooting_js

   If the guide doesn't help or you encounter a bug, please let us know:
   https://github.com/getsentry/sentry-javascript/issues`,
   )}
`);
}

async function askForUsedBundlerTool(): Promise<SupportedTools> {
  const selectedTool: SupportedTools | symbol = await abortIfCancelled(
    clack.select({
      message: 'Which bundler or build tool are you using?',
      options: [
        {
          label: 'Webpack',
          value: 'webpack',
          hint: 'Configure source maps upload using Webpack',
        },
        {
          label: 'Vite',
          value: 'vite',
          hint: 'Configure source maps upload using Vite',
        },
        {
          label: 'esbuild',
          value: 'esbuild',
          hint: 'Configure source maps upload using esbuild',
        },
        {
          label: 'Rollup',
          value: 'rollup',
          hint: 'Configure source maps upload using Rollup',
        },
        {
          label: 'tsc',
          value: 'tsc',
          hint: 'Configure source maps when using tsc as build tool',
        },
        {
          label: 'None of the above',
          value: 'sentry-cli',
          hint: 'This will configure source maps upload for you using sentry-cli',
        },
      ],
    }),
  );

  return selectedTool;
}

async function startToolSetupFlow(
  selctedTool: SupportedTools,
  options: SourceMapUploadToolConfigurationOptions,
): Promise<void> {
  switch (selctedTool) {
    case 'webpack':
      await configureWebPackPlugin(options);
      break;
    case 'vite':
      await configureVitePlugin(options);
      break;
    case 'esbuild':
      await configureEsbuildPlugin(options);
      break;
    case 'rollup':
      await configureRollupPlugin(options);
      break;
    case 'tsc':
      await configureSentryCLI(options, configureTscSourcemapGenerationFlow);
      break;
    default:
      await configureSentryCLI(options);
      break;
  }
}
