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
import { debug } from '../../utils/debug';

const getViteConfigSnippet = (
  options: SourceMapUploadToolConfigurationOptions,
  colors: boolean,
) => {
  const rawImportStmt =
    'import { sentryVitePlugin } from "@sentry/vite-plugin";';
  const rawGenerateSourceMapsOption =
    'sourcemap: true, // Source map generation must be turned on';
  const rawSentryVitePluginFunction = `sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "${options.orgSlug}",
      project: "${options.projectSlug}",${
    options.selfHosted ? `\n      url: "${options.url}",` : ''
  }
    }),`;

  const importStmt = colors ? chalk.greenBright(rawImportStmt) : rawImportStmt;
  const generateSourceMapsOption = colors
    ? chalk.greenBright(rawGenerateSourceMapsOption)
    : rawGenerateSourceMapsOption;
  const sentryVitePluginFunction = colors
    ? chalk.greenBright(rawSentryVitePluginFunction)
    : rawSentryVitePluginFunction;

  const code = getViteConfigContent(
    importStmt,
    generateSourceMapsOption,
    sentryVitePluginFunction,
  );
  return colors ? chalk.gray(code) : code;
};

const getViteConfigContent = (
  importStmt: string,
  generateSourceMapsOption: string,
  sentryVitePluginFunction: string,
) => `import { defineConfig } from "vite";
${importStmt}

export default defineConfig({
  build: {
    ${generateSourceMapsOption}
  },
  plugins: [
    // Put the Sentry vite plugin after all other plugins
    ${sentryVitePluginFunction}
  ],
});
`;

export const configureVitePlugin: SourceMapUploadToolConfigurationFunction =
  async (options) => {
    await installPackage({
      packageName: '@sentry/vite-plugin',
      alreadyInstalled: hasPackageInstalled(
        '@sentry/vite-plugin',
        await getPackageDotJson(),
      ),
    });

    const viteConfigPath =
      findScriptFile(path.resolve(process.cwd(), 'vite.config')) ||
      (await askForViteConfigPath());

    let successfullyAdded = false;
    if (viteConfigPath) {
      successfullyAdded = await addVitePluginToConfig(viteConfigPath, options);
    } else {
      successfullyAdded = await createNewViteConfig(options);
    }

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

async function createNewViteConfig(
  options: SourceMapUploadToolConfigurationOptions,
): Promise<boolean> {
  try {
    await fs.promises.writeFile(
      'vite.config.js',
      getViteConfigSnippet(options, false),
    );
    Sentry.setTag('created-new-config', 'success');
    return true;
  } catch (e) {
    debug(e);
    Sentry.setTag('created-new-config', 'fail');
    clack.log.warn(
      `Could not create a new ${chalk.cyan(
        'vite.config.js',
      )} file. Please create one manually and follow the instructions below.`,
    );

    clack.log.info(
      chalk.gray(
        'More information about vite configs: https://vitejs.dev/config/',
      ),
    );

    return false;
  }
}

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
      const shouldContinue = await abortIfCancelled(
        clack.select({
          message: `${prettyViteConfigFilename} already contains Sentry-related code. Should the wizard modify it anyway?`,
          options: [
            {
              label: 'Yes, add the Sentry Vite plugin',
              value: true,
            },
            {
              label: 'No, show me instructions to manually add the plugin',
              value: false,
            },
          ],
          initialValue: true,
        }),
      );

      if (!shouldContinue) {
        Sentry.setTag('ast-mod-fail-reason', 'has-sentry-content');
        return false;
      }
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
    debug(e);
    Sentry.setTag('ast-mod-fail-reason', 'insertion-fail');
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
  console.log(`\n${getViteConfigSnippet(options, true)}`);

  await abortIfCancelled(
    select({
      message: 'Did you copy the snippet above?',
      options: [{ label: 'Yes, continue!', value: true }],
      initialValue: true,
    }),
  );
}

async function askForViteConfigPath(): Promise<string | undefined> {
  const hasViteConfig = await abortIfCancelled(
    clack.confirm({
      message: `Do you have a vite config file (e.g. ${chalk.cyan(
        'vite.config.js',
      )}?`,
      initialValue: true,
    }),
  );

  if (!hasViteConfig) {
    return undefined;
  }

  return await abortIfCancelled(
    clack.text({
      message: 'Please enter the path to your vite config file:',
      placeholder: `.${path.sep}vite.config.js`,
      validate: (value) => {
        if (!value) {
          return 'Please enter a path.';
        }

        try {
          fs.accessSync(value);
        } catch {
          return 'Could not access the file at this path.';
        }
      },
    }),
  );
}
