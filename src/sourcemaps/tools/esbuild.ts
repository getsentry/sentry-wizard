// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack, { select } from '@clack/prompts';
import chalk from 'chalk';
import {
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
} from '../../utils/clack';
import { ensureBundlerPlugin } from '../utils/bundler-plugin';

import {
  SourceMapUploadToolConfigurationFunction,
  SourceMapUploadToolConfigurationOptions,
} from './types';

const getCodeSnippet = (
  options: SourceMapUploadToolConfigurationOptions,
  importPath: string,
) =>
  chalk.gray(`
${chalk.greenBright(
  `const { sentryEsbuildPlugin } = require("${importPath}");`,
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
    const importPath = await ensureBundlerPlugin('esbuild');

    clack.log.step(`Add the following code to your esbuild config:`);

    // Intentially logging directly to console here so that the code can be copied/pasted directly
    // eslint-disable-next-line no-console
    console.log(getCodeSnippet(options, importPath));

    await abortIfCancelled(
      select({
        message: 'Did you copy the snippet above?',
        options: [{ label: 'Yes, continue!', value: true }],
        initialValue: true,
      }),
    );

    await addDotEnvSentryBuildPluginFile(options.authToken);
  };
