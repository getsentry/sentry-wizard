import * as fs from 'node:fs';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';

import { getLastRequireIndex, hasSentryContent } from '../utils/ast-utils';
import { makeCodeSnippet, showCopyPasteInstructions } from '../utils/clack';

import { metroConfigPath, parseMetroConfig, writeMetroConfig } from './metro';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

const b = recast.types.builders;

export async function addSentryToExpoMetroConfig() {
  if (!fs.existsSync(metroConfigPath)) {
    const success = await createSentryExpoMetroConfig();
    if (!success) {
      Sentry.setTag('expo-metro-config', 'create-new-error');
      return await showInstructions();
    }
    Sentry.setTag('expo-metro-config', 'created-new');
    return undefined;
  }

  Sentry.setTag('expo-metro-config', 'exists');
  clack.log.info(`Updating existing ${metroConfigPath}.`);

  const mod = await parseMetroConfig();
  if (!mod) {
    return await showInstructions();
  }

  let didPatch = false;
  try {
    didPatch = patchMetroInMemory(mod);
  } catch (e) {
    Sentry.captureException(e);
  }
  if (!didPatch) {
    Sentry.setTag('expo-metro-config', 'patch-error');
    clack.log.error(
      `Could not patch ${chalk.cyan(
        metroConfigPath,
      )} with Sentry configuration.`,
    );
    return await showInstructions();
  }

  const saved = await writeMetroConfig(mod);
  if (saved) {
    Sentry.setTag('expo-metro-config', 'patch-saved');
    clack.log.success(
      chalk.green(`${chalk.cyan(metroConfigPath)} changes saved.`),
    );
  } else {
    Sentry.setTag('expo-metro-config', 'patch-save-error');
    clack.log.error(
      `Could not save changes to ${chalk.cyan(
        metroConfigPath,
      )}, please follow the manual steps.`,
    );
    return await showInstructions();
  }
}

export function patchMetroInMemory(mod: ProxifiedModule): boolean {
  const ast = mod.$ast as t.Program;

  if (hasSentryContent(ast)) {
    clack.log.warn(
      `The ${chalk.cyan(
        metroConfigPath,
      )} file already has Sentry configuration.`,
    );
    return false;
  }

  let didReplaceDefaultConfigCall = false;

  recast.visit(ast, {
    visitVariableDeclaration(path) {
      const { node } = path;

      if (
        // path is require("expo/metro-config")
        // and only getDefaultConfig is being destructured
        // then remove the entire declaration
        node.declarations.length > 0 &&
        node.declarations[0].type === 'VariableDeclarator' &&
        node.declarations[0].init &&
        node.declarations[0].init.type === 'CallExpression' &&
        node.declarations[0].init.callee &&
        node.declarations[0].init.callee.type === 'Identifier' &&
        node.declarations[0].init.callee.name === 'require' &&
        node.declarations[0].init.arguments[0].type === 'StringLiteral' &&
        node.declarations[0].init.arguments[0].value === 'expo/metro-config' &&
        node.declarations[0].id.type === 'ObjectPattern' &&
        node.declarations[0].id.properties.length === 1 &&
        node.declarations[0].id.properties[0].type === 'ObjectProperty' &&
        node.declarations[0].id.properties[0].key.type === 'Identifier' &&
        node.declarations[0].id.properties[0].key.name === 'getDefaultConfig'
      ) {
        path.prune();
        return false;
      }

      this.traverse(path);
    },

    visitCallExpression(path) {
      const { node } = path;
      if (
        // path is getDefaultConfig
        // then rename it to getSentryExpoConfig
        node.callee.type === 'Identifier' &&
        node.callee.name === 'getDefaultConfig'
      ) {
        node.callee.name = 'getSentryExpoConfig';
        didReplaceDefaultConfigCall = true;
        return false;
      }

      this.traverse(path);
    },
  });

  if (!didReplaceDefaultConfigCall) {
    clack.log.warn(
      `Could not find \`getDefaultConfig\` in ${chalk.cyan(metroConfigPath)}.`,
    );
    return false;
  }

  addSentryExpoConfigRequire(ast);

  return true;
}

export function addSentryExpoConfigRequire(program: t.Program) {
  try {
    const lastRequireIndex = getLastRequireIndex(program);
    const sentryExpoConfigRequire = createSentryExpoConfigRequire();

    // Add the require statement after the last require or at the beginning
    program.body.splice(lastRequireIndex + 1, 0, sentryExpoConfigRequire);
  } catch (error) {
    clack.log.error(
      `Could not add Sentry Expo config require statement to ${chalk.cyan(
        metroConfigPath,
      )}.`,
    );
    Sentry.captureException(error);
  }
}

/**
 * Creates const { getSentryExpoConfig } = require("@sentry/react-native/metro");
 */
function createSentryExpoConfigRequire() {
  return b.variableDeclaration('const', [
    b.variableDeclarator(
      b.objectPattern([
        b.objectProperty.from({
          key: b.identifier('getSentryExpoConfig'),
          value: b.identifier('getSentryExpoConfig'),
          shorthand: true,
        }),
      ]),
      b.callExpression(b.identifier('require'), [
        b.literal('@sentry/react-native/metro'),
      ]),
    ),
  ]);
}

async function createSentryExpoMetroConfig(): Promise<boolean> {
  const snippet = `const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

module.exports = config;
`;
  try {
    await fs.promises.writeFile(metroConfigPath, snippet);
  } catch (e) {
    clack.log.error(
      `Could not create ${chalk.cyan(
        metroConfigPath,
      )} with Sentry configuration.`,
    );
    Sentry.captureException(e);
    return false;
  }
  clack.log.success(
    `Created ${chalk.cyan(metroConfigPath)} with Sentry configuration.`,
  );
  return true;
}

function showInstructions() {
  return showCopyPasteInstructions({
    filename: metroConfigPath,
    codeSnippet: getMetroWithSentryExpoConfigSnippet(true),
  });
}

function getMetroWithSentryExpoConfigSnippet(colors: boolean): string {
  return makeCodeSnippet(colors, (unchanged, plus, minus) =>
    unchanged(`${minus(
      `// const { getDefaultConfig } = require("expo/metro-config");`,
    )}
${plus(
  `const { getSentryExpoConfig } = require("@sentry/react-native/metro");`,
)}

${minus(`// const config = getDefaultConfig(__dirname);`)}
${plus(`const config = getSentryExpoConfig(__dirname);`)}

module.exports = config;`),
  );
}
