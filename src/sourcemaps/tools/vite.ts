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
import { defineConfig } from "vite";
${chalk.greenBright('import { sentryVitePlugin } from "@sentry/vite-plugin"')};

export default defineConfig({
  build: {
    ${chalk.greenBright(
      'sourcemap: true, // Source map generation must be turned on',
    )}
  },
  plugins: [
    // Put the Sentry vite plugin after all other plugins
    ${chalk.greenBright(`sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "${options.orgSlug}",
      project: "${options.projectSlug}",${
      options.selfHosted ? `\n      url: "${options.url}",` : ''
    }
    }),`)}
  ],
});
`);

export const configureVitePlugin: SourceMapUploadToolConfigurationFunction =
  async (options) => {
    await installPackage({
      packageName: '@sentry/vite-plugin',
      alreadyInstalled: hasPackageInstalled(
        '@sentry/vite-plugin',
        await getPackageDotJson(),
      ),
    });

    clack.log.step(
      `Add the following code to your ${chalk.bold('vite.config.js')} file:`,
    );

    // Intentially logging directly to console here so that the code can be copied/pasted directly
    // eslint-disable-next-line no-console
    console.log(getCodeSnippet(options));

    const copiedConfigSnippet = await select({
      message: 'Did you copy the snippet above?',
      options: [{ label: 'Yes, continue!', value: true }],
      initialValue: true,
    });
    abortIfCancelled(copiedConfigSnippet);

    clack.log.step(
      'Add the Sentry auth token as an environment variable to your CI setup:',
    );

    // Intentially logging directly to console here so that the code can be copied/pasted directly
    // eslint-disable-next-line no-console
    console.log(
      chalk.greenBright(`
SENTRY_AUTH_TOKEN=${options.authToken}
`),
    );

    clack.log.warn(
      chalk.yellow('DO NOT commit this auth token to your repository!'),
    );

    const setUpCi = await select({
      message: 'Did you configure CI as shown above?',
      options: [
        { label: 'Yes, continue!', value: true },
        {
          label: "I'll do it later...",
          value: false,
          hint: chalk.yellowBright(
            'You need to set the auth token to upload source maps in CI',
          ),
        },
      ],
      initialValue: true,
    });
    abortIfCancelled(setUpCi);

    await addDotEnvSentryBuildPluginFile(options.authToken);
  };
