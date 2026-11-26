// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { addVitePlugin } from 'magicast/helpers';

import type { namedTypes as t } from 'ast-types';

import * as Sentry from '@sentry/node';

import chalk from 'chalk';
import {
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
  askForToolConfigPath,
  createNewConfigFile,
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../../utils/clack';

import {
  SourceMapUploadToolConfigurationFunction,
  SourceMapUploadToolConfigurationOptions,
} from './types';
import {
  findFile,
  getObjectProperty,
  hasSentryContent,
  preserveTrailingNewline,
} from '../../utils/ast-utils';
import { ensureBundlerPlugin } from '../utils/bundler-plugin';
import { askShouldRemoveDisabledSourceMaps } from '../utils/disabled-source-maps';

import * as path from 'path';
import * as fs from 'fs';
import { debug } from '../../utils/debug';

const getViteConfigSnippet = (
  options: SourceMapUploadToolConfigurationOptions,
  colors: boolean,
  importPath: string,
) =>
  makeCodeSnippet(colors, (unchanged, plus, _) =>
    unchanged(`import { defineConfig } from "vite";
${plus(`import { sentryVitePlugin } from "${importPath}";`)}

export default defineConfig({
  // Leave \`build.sourcemap\` unset. The Sentry plugin then generates hidden source
  // maps and removes them from the build output after uploading them.
  plugins: [
    // Put the Sentry vite plugin after all other plugins
    ${plus(`sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "${options.orgSlug}",
      project: "${options.projectSlug}",${
      options.selfHosted ? `\n      url: "${options.url}",` : ''
    }
    }),`)}
  ],
});`),
  );

export const configureVitePlugin: SourceMapUploadToolConfigurationFunction =
  async (options) => {
    const importPath = await ensureBundlerPlugin('vite');

    const viteConfigPath =
      findFile(path.resolve(process.cwd(), 'vite.config')) ??
      (await askForToolConfigPath('Vite', 'vite.config.js'));

    let successfullyAdded = false;
    if (viteConfigPath) {
      successfullyAdded = await addVitePluginToConfig(
        viteConfigPath,
        options,
        importPath,
      );
    } else {
      successfullyAdded = await createNewConfigFile(
        path.join(process.cwd(), 'vite.config.js'),
        getViteConfigSnippet(options, false, importPath),
        'More information about vite configs: https://vitejs.dev/config/',
      );
      Sentry.setTag(
        'created-new-config',
        successfullyAdded ? 'success' : 'fail',
      );
    }

    if (successfullyAdded) {
      clack.log.info(
        `We recommend checking the ${
          viteConfigPath ? 'modified' : 'added'
        } file after the wizard finished to ensure it works with your build setup.`,
      );

      Sentry.setTag('ast-mod', 'success');
    } else {
      Sentry.setTag('ast-mod', 'fail');
      await showCopyPasteInstructions({
        filename: path.basename(viteConfigPath || 'vite.config.js'),
        codeSnippet: getViteConfigSnippet(options, true, importPath),
      });
    }

    await addDotEnvSentryBuildPluginFile(options.authToken);
  };

export async function addVitePluginToConfig(
  viteConfigPath: string,
  options: SourceMapUploadToolConfigurationOptions,
  importPath: string,
): Promise<boolean> {
  try {
    const prettyViteConfigFilename = chalk.cyan(path.basename(viteConfigPath));

    const viteConfigContent = (
      await fs.promises.readFile(viteConfigPath)
    ).toString();

    const mod = parseModule(viteConfigContent);

    if (hasSentryContent(mod.$ast as t.Program)) {
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

    const handledSourcemaps = await handleDisabledSourcemaps(
      mod.$ast as t.Program,
      prettyViteConfigFilename,
    );
    if (!handledSourcemaps) {
      Sentry.setTag('ast-mod-fail-reason', 'insertion-fail');
      return false;
    }

    const { orgSlug: org, projectSlug: project, selfHosted, url } = options;

    addVitePlugin(mod, {
      imported: 'sentryVitePlugin',
      from: importPath,
      constructor: 'sentryVitePlugin',
      options: {
        org,
        project,
        ...(selfHosted && { url }),
      },
    });

    const code = preserveTrailingNewline(
      viteConfigContent,
      generateCode(mod.$ast).code,
    );

    await fs.promises.writeFile(viteConfigPath, code);

    clack.log.success(
      `Added the Sentry Vite plugin to ${prettyViteConfigFilename}.`,
    );

    return true;
  } catch (e) {
    debug(e);
    Sentry.setTag('ast-mod-fail-reason', 'insertion-fail');
    return false;
  }
}

/**
 * Offers to remove `build.sourcemap: false`. All other values are left alone:
 * if the option is unset, the Sentry plugin generates hidden source maps and
 * removes them after the upload.
 *
 * @returns false if the config object could not be found
 */
async function handleDisabledSourcemaps(
  program: t.Program,
  prettyConfigFilename: string,
): Promise<boolean> {
  const configObj = getViteConfigObject(program);

  if (!configObj) {
    return false;
  }

  const buildProp = getObjectProperty(configObj, 'build');

  // A `build` value we can't analyze doesn't block adding the plugin. If it
  // turns off source maps, the plugin warns about it during the build.
  if (buildProp?.value.type !== 'ObjectExpression') {
    return true;
  }

  const buildObj = buildProp.value;
  const sourcemapProp = getObjectProperty(buildObj, 'sourcemap');

  if (
    sourcemapProp?.value.type === 'BooleanLiteral' &&
    !sourcemapProp.value.value &&
    (await askShouldRemoveDisabledSourceMaps(
      'build.sourcemap: false',
      prettyConfigFilename,
    ))
  ) {
    buildObj.properties = buildObj.properties.filter(
      (p) => p !== sourcemapProp,
    );
    clack.log.success(
      `Removed ${chalk.cyan(
        'build.sourcemap: false',
      )} from ${prettyConfigFilename}.`,
    );
  }

  return true;
}

function getViteConfigObject(
  program: t.Program,
): t.ObjectExpression | undefined {
  const defaultExport = program.body.find(
    (s) => s.type === 'ExportDefaultDeclaration',
  ) as t.ExportDefaultDeclaration;

  if (!defaultExport) {
    return undefined;
  }

  if (defaultExport.declaration.type === 'ObjectExpression') {
    return defaultExport.declaration;
  }

  if (
    defaultExport.declaration.type === 'CallExpression' &&
    defaultExport.declaration.arguments[0].type === 'ObjectExpression'
  ) {
    return defaultExport.declaration.arguments[0];
  }

  if (defaultExport.declaration.type === 'Identifier') {
    const configId = defaultExport.declaration.name;
    return findConfigNode(configId, program);
  }

  return undefined;
}

function findConfigNode(
  configId: string,
  program: t.Program,
): t.ObjectExpression | undefined {
  for (const node of program.body) {
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        if (
          declaration.type === 'VariableDeclarator' &&
          declaration.id.type === 'Identifier' &&
          declaration.id.name === configId &&
          declaration.init?.type === 'ObjectExpression'
        ) {
          return declaration.init;
        }
      }
    }
  }
  return undefined;
}
