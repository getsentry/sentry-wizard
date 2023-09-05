// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { addVitePlugin } from 'magicast/helpers';

import type { namedTypes as t } from 'ast-types';

import * as recast from 'recast';

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
import { findFile, hasSentryContent } from '../../utils/ast-utils';

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
      findFile(path.resolve(process.cwd(), 'vite.config')) ||
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

export async function addVitePluginToConfig(
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

    const enabledSourcemaps = enableSourcemapGeneration(mod.$ast as t.Program);
    if (!enabledSourcemaps) {
      Sentry.setTag('ast-mod-fail-reason', 'insertion-fail');
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
      `Added the Sentry Vite plugin to ${prettyViteConfigFilename} and enabled source maps`,
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
    clack.select({
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

function enableSourcemapGeneration(program: t.Program): boolean {
  const configObj = getViteConfigObject(program);

  if (!configObj) {
    return false;
  }

  const b = recast.types.builders;

  const buildProp = configObj.properties.find(
    (p: t.ObjectProperty) =>
      p.key.type === 'Identifier' && p.key.name === 'build',
  );

  // case 1: build property doesn't exist yet, so we can just add it
  if (!buildProp) {
    configObj.properties.push(
      b.objectProperty(
        b.identifier('build'),
        b.objectExpression([
          b.objectProperty(b.identifier('sourcemap'), b.booleanLiteral(true)),
        ]),
      ),
    );
    return true;
  }

  const isValidBuildProp =
    buildProp.type === 'ObjectProperty' &&
    buildProp.value.type === 'ObjectExpression';

  if (!isValidBuildProp) {
    return false;
  }

  const sourceMapsProp =
    buildProp.value.type === 'ObjectExpression' &&
    buildProp.value.properties.find(
      (p: t.ObjectProperty) =>
        p.key.type === 'Identifier' && p.key.name === 'sourcemap',
    );

  // case 2: build.sourcemap property doesn't exist yet, so we just add it
  if (!sourceMapsProp && buildProp.value.type === 'ObjectExpression') {
    buildProp.value.properties.push(
      b.objectProperty(b.identifier('sourcemap'), b.booleanLiteral(true)),
    );
    return true;
  }

  if (!sourceMapsProp || sourceMapsProp.type !== 'ObjectProperty') {
    return false;
  }

  // case 3: build.sourcemap property exists, and it's set to 'hidden'
  if (
    sourceMapsProp.value.type === 'StringLiteral' &&
    sourceMapsProp.value.value === 'hidden'
  ) {
    // nothing to do for us
    return true;
  }

  // case 4: build.sourcemap property exists, but it's not enabled, so we set it to true
  //         or it is already true in which case this is a noop
  sourceMapsProp.value = b.booleanLiteral(true);
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
