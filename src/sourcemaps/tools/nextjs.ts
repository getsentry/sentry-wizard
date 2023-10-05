// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { runNextjsWizard } from '../../nextjs/nextjs-wizard';
import { traceStep } from '../../telemetry';
import { abortIfCancelled, addSentryCliConfig } from '../../utils/clack-utils';
import { WizardOptions } from '../../utils/types';

import { SourceMapUploadToolConfigurationOptions } from './types';

import * as Sentry from '@sentry/node';

const getCodeSnippet = (options: SourceMapUploadToolConfigurationOptions) =>
  chalk.grey(`
  ${chalk.greenBright(
    'const { withSentryConfig } = require("@sentry/nextjs");',
  )}

  const nextConfig = {
    // your existing next config
  };

  ${chalk.greenBright(`const sentryWebpackPluginOptions = {
    org: "${options.orgSlug}",
    project: "${options.projectSlug}",${
    options.selfHosted ? `\n    url: "${options.url}",` : ''
  }
  };`)}

  ${chalk.greenBright(`const sentryOptions = {
    // Upload additional client files (increases upload size)
    widenClientFileUpload: true,

    // Hides source maps from generated client bundles
    hideSourceMaps: true,
  };`)}

  ${chalk.greenBright(`module.exports = withSentryConfig(
    nextConfig,
    sentryWebpackPluginOptions,
    sentryOptions
  );`)}
`);

export const configureNextJsSourceMapsUpload = async (
  options: SourceMapUploadToolConfigurationOptions,
  wizardOptions: WizardOptions,
) => {
  clack.log
    .info(`Source Maps upload for Next.js is configured automatically by default if you run the Sentry Wizard for Next.JS.
But don't worry, we can redirect you to the wizard now!

In case you already tried the wizard, we can also show you how to configure your ${chalk.cyan(
    'next.config.js',
  )} file manually instead.`);

  const shouldRedirect: boolean = await abortIfCancelled(
    clack.select({
      message: 'Do you want to run the Sentry Wizard for Next.JS now?',
      options: [
        {
          label: 'Yes, run the wizard!',
          value: true,
          hint: 'The wizard can also configure your SDK setup',
        },
        {
          label: 'No, show me how to configure it manually',
          value: false,
        },
      ],
    }),
  );

  Sentry.setTag('redirect-nextjs-wizard', shouldRedirect);

  if (shouldRedirect) {
    await traceStep('run-nextjs-wizard', () => runNextjsWizard(wizardOptions));
    clack.intro('Sentry Source Maps Upload Configuration Wizard');
    clack.log.info(
      "Welcome back to the Source Maps wizard - we're almost done ;)",
    );
  } else {
    clack.log.info(
      `Add the following code to your ${chalk.cyan('next.config.js')}:`,
    );

    // Intentionally logging directly to console here
    // eslint-disable-next-line no-console
    console.log(getCodeSnippet(options));

    await traceStep('nextjs-manual-nextconfigjs', () =>
      abortIfCancelled(
        clack.select({
          message: 'Did you copy the code above?',
          options: [{ label: 'Yes, continue!', value: true }],
          initialValue: true,
        }),
      ),
    );

    await traceStep('nextjs-manual-sentryclirc', () =>
      addSentryCliConfig({ authToken: options.authToken }),
    );
  }

  clack.log
    .info(`In case you still run into problems, check out our docs to further debug your setup:

Uploading Source Maps:
https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-source-maps

Troubleshooting Source Maps:
https://docs.sentry.io/platforms/javascript/guides/nextjs/troubleshooting/`);
};
