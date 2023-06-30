// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack, { select } from '@clack/prompts';
import chalk from 'chalk';
import {
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
  getPackageDotJson,
  hasPackageInstalled,
  installPackage,
} from '../../utils/clack-utils';

import {
  SourceMapUploadToolConfigurationFunction,
  SourceMapUploadToolConfigurationOptions,
} from './types';

const getCodeSnippet = (options: SourceMapUploadToolConfigurationOptions) =>
  chalk.gray(`
  ${chalk.greenBright(
    'import { sentryRollupPlugin } from "@sentry/rollup-plugin";',
  )}

  export default {
    output: {
      ${chalk.greenBright(
        'sourcemap: true, // Source map generation must be turned on',
      )}
    },
    plugins: [
      // Put the Sentry rollup plugin after all other plugins
      ${chalk.greenBright(`sentryRollupPlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: "${options.orgSlug}",
        project: "${options.projectSlug}",${
        options.selfHosted ? `\n      url: "${options.url}",` : ''
      }
      }),`)}
    ],
  };
`);

export const configureRollupPlugin: SourceMapUploadToolConfigurationFunction =
  async (options) => {
    await installPackage({
      packageName: '@sentry/rollup-plugin',
      alreadyInstalled: hasPackageInstalled(
        '@sentry/rollup-plugin',
        await getPackageDotJson(),
      ),
    });

    clack.log.step(
      `Add the following code to your ${chalk.bold('rollup.config.js')} file:`,
    );

    // Intentially logging directly to console here so that the code can be copied/pasted directly
    // eslint-disable-next-line no-console
    console.log(getCodeSnippet(options));

    await abortIfCancelled(
      select({
        message: 'Did you copy the snippet above?',
        options: [{ label: 'Yes, continue!', value: true }],
        initialValue: true,
      }),
    );

    await addDotEnvSentryBuildPluginFile(options.authToken);
  };
