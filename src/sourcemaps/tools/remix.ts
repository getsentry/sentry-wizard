// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { runRemixWizard } from '../../remix/remix-wizard';
import { traceStep } from '../../telemetry';
import { abortIfCancelled } from '../../utils/clack-utils';
import { WizardOptions } from '../../utils/types';
import { SourceMapUploadToolConfigurationOptions } from './types';

import * as Sentry from '@sentry/node';

export const configureRemixSourceMapsUpload = async (
  options: SourceMapUploadToolConfigurationOptions,
  wizardOptions: WizardOptions,
) => {
  clack.log
    .info(`Source Maps upload for Remix is configured automatically by default if you run the Sentry Wizard for Remix.
But don't worry, we can redirect you to the wizard now!
In case you already tried the wizard, we can also show you how to configure your ${chalk.cyan(
    'remix.config.js',
  )} file manually instead.`);

  const shouldRedirect: boolean = await abortIfCancelled(
    clack.select({
      message: 'Do you want to run the Sentry Wizard for Remix now?',
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

  Sentry.setTag('redirect-remix-wizard', shouldRedirect);

  if (shouldRedirect) {
    await traceStep('run-remix-wizard', () => runRemixWizard(wizardOptions));
    clack.intro('Sentry Source Maps Upload Configuration Wizard');
    clack.log.info(
      "Welcome back to the Source Maps wizard - we're almost done ;)",
    );
  } else {
    clack.log.info(
      `Build your app with ${chalk.cyan(
        'remix build --sourcemap',
      )}, then upload your source maps using ${chalk.cyan(
        'sentry-upload-sourcemaps',
      )} cli tool.`,
    );

    clack.log.info(
      `You can add ${chalk.cyan(
        'sentry-upload-sourcemaps',
      )} to your build script in ${chalk.cyan('package.json')} like this:
${chalk.dim(`
...
"scripts": {
  "build": "remix build --sourcemap && sentry-upload-sourcemaps"
}
...`)}
or run it manually after building your app.

To see all available options for ${chalk.cyan(
        'sentry-upload-sourcemaps',
      )}, run ${chalk.cyan('sentry-upload-sourcemaps --help')}
`,
    );

    await abortIfCancelled(
      clack.select({
        message: 'Did you finish configuring your build and prod scripts?',
        options: [{ label: 'Yes, continue!', value: true }],
        initialValue: true,
      }),
    );
  }
};
