// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';

import {
  abort,
  abortIfCancelled,
  confirmContinueIfNoOrDirtyGitRepo,
  SENTRY_DOT_ENV_FILE,
  printWelcome,
  SENTRY_CLI_RC_FILE,
  getOrAskForProjectData,
} from '../utils/clack-utils';
import { isUnicodeSupported } from '../utils/vendor/is-unicorn-supported';
import type { SourceMapUploadToolConfigurationOptions } from './tools/types';
import { configureVitePlugin } from './tools/vite';
import { setupNpmScriptInCI, configureSentryCLI } from './tools/sentry-cli';
import { configureWebPackPlugin } from './tools/webpack';
import { configureTscSourcemapGenerationFlow } from './tools/tsc';
import { configureRollupPlugin } from './tools/rollup';
import { configureEsbuildPlugin } from './tools/esbuild';
import type { WizardOptions } from '../utils/types';
import { configureCRASourcemapGenerationFlow } from './tools/create-react-app';
import { ensureMinimumSdkVersionIsInstalled } from './utils/sdk-version';
import { traceStep, withTelemetry } from '../telemetry';
import { checkIfMoreSuitableWizardExistsAndAskForRedirect } from './utils/other-wizards';
import { configureAngularSourcemapGenerationFlow } from './tools/angular';
import type { SupportedTools } from './utils/detect-tool';
import { detectUsedTool } from './utils/detect-tool';
import { configureNextJsSourceMapsUpload } from './tools/nextjs';
import { configureRemixSourceMapsUpload } from './tools/remix';
import { detectPackageManger } from '../utils/package-manager';
import { getIssueStreamUrl } from '../utils/url';

export async function runSourcemapsWizard(
  options: WizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'sourcemaps',
      wizardOptions: options,
    },
    () => runSourcemapsWizardWithTelemetry(options),
  );
}

async function runSourcemapsWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Source Maps Upload Configuration Wizard',
    message: `This wizard will help you upload source maps to Sentry as part of your build.
Thank you for using Sentry :)${
      options.telemetryEnabled
        ? `

(This setup wizard sends telemetry data and crash reports to Sentry.
You can turn this off by running the wizard with the '--disable-telemetry' flag.)`
        : ''
    }`,
    promoCode: options.promoCode,
  });

  const moreSuitableWizard = await traceStep(
    'check-framework-wizard',
    checkIfMoreSuitableWizardExistsAndAskForRedirect,
  );
  if (moreSuitableWizard) {
    await traceStep('run-framework-wizard', () => moreSuitableWizard(options));
    return;
  }

  await confirmContinueIfNoOrDirtyGitRepo();

  await traceStep('check-sdk-version', ensureMinimumSdkVersionIsInstalled);

  const { selfHosted, selectedProject, sentryUrl, authToken } =
    await getOrAskForProjectData(options);

  const wizardOptionsWithPreSelectedProject = {
    ...options,
    preSelectedProject: {
      project: selectedProject,
      authToken,
      selfHosted,
    },
  };

  const selectedTool = await traceStep('select-tool', askForUsedBundlerTool);

  Sentry.setTag('selected-tool', selectedTool);

  if (selectedTool === 'no-tool') {
    clack.log.info(
      "No Problem! But in this case, there's nothing to configure :)",
    );
    await abort('Exiting, have a great day!', 0);
    return;
  }

  await traceStep('tool-setup', () =>
    startToolSetupFlow(
      selectedTool,
      {
        orgSlug: selectedProject.organization.slug,
        projectSlug: selectedProject.slug,
        selfHosted,
        url: sentryUrl,
        authToken,
      },
      wizardOptionsWithPreSelectedProject,
    ),
  );

  await traceStep('ci-setup', () =>
    configureSourcemapUpload(selectedTool, authToken, options.comingFrom),
  );

  traceStep('outro', () =>
    printOutro(
      sentryUrl,
      selectedProject.organization.slug,
      selectedProject.id,
    ),
  );
}

async function askForUsedBundlerTool(): Promise<SupportedTools> {
  const selectedTool = await abortIfCancelled(
    clack.select({
      message: 'Which framework, bundler or build tool are you using?',
      options: [
        {
          label: 'Angular',
          value: 'angular',
          hint: 'Select this option if you are using Angular.',
        },
        {
          label: 'Create React App',
          value: 'create-react-app',
          hint: 'Select this option if you set up your app with Create React App.',
        },
        {
          label: 'Next.js',
          value: 'nextjs',
          hint: 'Select this option if you want to set up source maps in a Next.js project.',
        },
        {
          label: 'Remix',
          value: 'remix',
          hint: 'Select this option if you want to set up source maps in a Remix project.',
        },
        {
          label: 'Webpack',
          value: 'webpack',
          hint: 'Select this if you are using Webpack and you have access to your Webpack config.',
        },
        {
          label: 'Vite',
          value: 'vite',
          hint: 'Select this if you are using Vite and you have access to your Vite config.',
        },
        {
          label: 'esbuild',
          value: 'esbuild',
          hint: 'Select this if you are using esbuild and you have access to your esbuild config.',
        },
        {
          label: 'Rollup',
          value: 'rollup',
          hint: 'Select this if you are using Rollup and you have access to your Rollup config.',
        },
        {
          label: 'tsc',
          value: 'tsc',
          hint: 'Configure source maps when using tsc as build tool',
        },
        {
          label: 'I use another tool',
          value: 'sentry-cli',
          hint: 'This will configure source maps upload for you using sentry-cli',
        },
        {
          label: "I don't minify, transpile or bundle my code",
          value: 'no-tool',
          hint: 'This will exit the wizard',
        },
      ],
      initialValue: await detectUsedTool(),
    }),
  );

  return selectedTool;
}

async function startToolSetupFlow(
  selctedTool: SupportedTools,
  options: SourceMapUploadToolConfigurationOptions,
  wizardOptions: WizardOptions,
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
    case 'create-react-app':
      await configureSentryCLI(options, configureCRASourcemapGenerationFlow);
      break;
    case 'angular':
      await configureSentryCLI(
        options,
        configureAngularSourcemapGenerationFlow,
      );
      break;
    case 'nextjs':
      await configureNextJsSourceMapsUpload(options, wizardOptions);
      break;
    case 'remix':
      await configureRemixSourceMapsUpload(options, wizardOptions);
      break;
    default:
      await configureSentryCLI(options);
      break;
  }
}
export async function configureSourcemapUpload(
  selectedTool: SupportedTools,
  authToken: string,
  comingFrom: WizardOptions['comingFrom'],
) {
  if (comingFrom === 'vercel') {
    Sentry.setTag('using-ci', true);
  } else {
    await traceStep('configure-ci', () => configureCI(selectedTool, authToken));
  }
}

export async function configureCI(
  selectedTool: SupportedTools,
  authToken: string,
): Promise<void> {
  const isUsingCI = await abortIfCancelled(
    clack.select({
      message: `Are you using a CI/CD tool to build and deploy your application?`,
      options: [
        {
          label: 'Yes',
          hint: 'I use a tool like GitHub Actions, GitLab, CircleCI, TravisCI, Jenkins, Vercel, ...',
          value: true,
        },
        {
          label: 'No',
          hint: 'I build and deploy my application manually',
          value: false,
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('using-ci', isUsingCI);

  const isCliBasedFlowTool = [
    'sentry-cli',
    'tsc',
    'angular',
    'create-react-app',
  ].includes(selectedTool);

  const authTokenFile = isCliBasedFlowTool
    ? SENTRY_CLI_RC_FILE
    : SENTRY_DOT_ENV_FILE;

  if (!isUsingCI) {
    clack.log.info(
      `No Problem! Just make sure that the Sentry auth token from ${chalk.cyan(
        authTokenFile,
      )} is available whenever you build and deploy your app.`,
    );
    return;
  }

  if (isCliBasedFlowTool) {
    await traceStep('ci-npm-script-setup', setupNpmScriptInCI);
  }

  await traceStep('ci-auth-token-setup', () => setupAuthTokenInCI(authToken));
}

async function setupAuthTokenInCI(authToken: string) {
  clack.log.step(
    'Add the Sentry authentication token as an environment variable to your CI setup:',
  );

  // Intentially logging directly to console here so that the code can be copied/pasted directly
  // eslint-disable-next-line no-console
  console.log(
    chalk.greenBright(`
SENTRY_AUTH_TOKEN=${authToken}
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
}

function printOutro(url: string, orgSlug: string, projectId: string) {
  const packageManager = detectPackageManger();
  const buildCommand = packageManager?.buildCommand ?? 'npm run build';

  const issueStreamUrl = getIssueStreamUrl({ url, orgSlug, projectId });

  const arrow = isUnicodeSupported() ? '→' : '->';

  clack.outro(`${chalk.green("That's it - everything is set up!")}

   ${chalk.cyan(`Test and validate your setup locally with the following Steps:

   1. Build your application in ${chalk.bold('production mode')}.
      ${chalk.gray(`${arrow} For example, run ${chalk.bold(buildCommand)}.`)}
      ${chalk.gray(
        `${arrow} You should see source map upload logs in your console.`,
      )}
   2. Run your application and throw a test error.
      ${chalk.gray(`${arrow} The error should appear in Sentry:`)}
      ${chalk.gray(`${arrow} ${issueStreamUrl}`)}
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
