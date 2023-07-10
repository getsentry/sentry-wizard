// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack, { select } from '@clack/prompts';
import chalk from 'chalk';
import {
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
  getPackageDotJson,
  installPackage,
} from '../../utils/clack-utils';
import { hasPackageInstalled } from '../../utils/package-json';

import {
  SourceMapUploadToolConfigurationFunction,
  SourceMapUploadToolConfigurationOptions,
} from './types';

const getCodeSnippet = (options: SourceMapUploadToolConfigurationOptions) =>
  chalk.gray(`
${chalk.greenBright(
  'const { sentryEsbuildPlugin } = require("@sentry/esbuild-plugin");',
)}

require("esbuild").build({
  ${chalk.greenBright(
    'sourcemap: true, // Source map generation must be turned on',
  )}
  plugins: [
    // Put the Sentry esbuild plugin after all other plugins
    ${chalk.greenBright(`sentryEsbuildPlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "${options.orgSlug}",
      project: "${options.projectSlug}",${
      options.selfHosted ? `\n      url: "${options.url}",` : ''
    }
    }),`)}
  ],
});
`);

export const configureEsbuildPlugin: SourceMapUploadToolConfigurationFunction =
  async (options) => {
    await installPackage({
      packageName: '@sentry/esbuild-plugin',
      alreadyInstalled: hasPackageInstalled(
        '@sentry/esbuild-plugin',
        await getPackageDotJson(),
      ),
    });

    clack.log.step(`Add the following code to your esbuild config:`);

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
