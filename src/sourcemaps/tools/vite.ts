// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack, { select } from '@clack/prompts';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { addVitePlugin } from 'magicast/helpers';

import * as Sentry from '@sentry/node';

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
import { findScriptFile, hasSentryContent } from '../../utils/ast-utils';

import * as path from 'path';
import * as fs from 'fs';

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

    const viteConfigPath = findScriptFile(
      path.resolve(process.cwd(), 'vite.config'),
    );

    const successfullyAdded =
      viteConfigPath && (await addVitePluginToConfig(viteConfigPath, options));

    if (successfullyAdded) {
      Sentry.setTag('ast-mod', 'success');
    } else {
      Sentry.setTag('ast-mod', 'fail');
      await showCopyPasteInstructions(
        path.basename(viteConfigPath || 'vite.config.js'),
        options,
      );
    }

    await addDotEnvSentryBuildPluginFile(options.authToken);
  };

async function addVitePluginToConfig(
  viteConfigPath: string,
  options: SourceMapUploadToolConfigurationOptions,
): Promise<boolean> {
  try {
    const prettyViteConfigFilename = chalk.cyan(path.basename(viteConfigPath));

    const viteConfigContent = (
      await fs.promises.readFile(viteConfigPath)
    ).toString();

    const mod = parseModule(viteConfigContent);

    if (hasSentryContent(mod)) {
      clack.log.warn(
        `File ${prettyViteConfigFilename} already contains Sentry code. 
Please follow the instruction below`,
      );
      return false;
    }

    const { orgSlug: org, projectSlug: project, selfHosted, url } = options;

    addVitePlugin(mod, {
      imported: 'sentryVitePlugin',
      from: '@sentry/vite-plugin',
      constructor: 'sentryVitePlugin',
      options: {
        org,
        project,
        ...(selfHosted && { url }),
      },
    });

    const code = generateCode(mod.$ast).code;

    await fs.promises.writeFile(viteConfigPath, code);

    clack.log.success(
      `Added the Sentry Vite plugin to ${prettyViteConfigFilename}`,
    );

    return true;
  } catch (e) {
    // TODO: debug(e)
    return false;
  }
}

async function showCopyPasteInstructions(
  viteConfigFilename: string,
  options: SourceMapUploadToolConfigurationOptions,
) {
  clack.log.step(
    `Add the following code to your ${chalk.cyan(viteConfigFilename)} file:`,
  );

  // Intentionally logging directly to console here so that the code can be copied/pasted directly
  // eslint-disable-next-line no-console
  console.log(getCodeSnippet(options));

  await abortIfCancelled(
    select({
      message: 'Did you copy the snippet above?',
      options: [{ label: 'Yes, continue!', value: true }],
      initialValue: true,
    }),
  );
}
