// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { ProxifiedModule, parseModule, writeFile } from 'magicast';
import * as fs from 'fs';
import * as Sentry from '@sentry/node';

import {
  getLastRequireIndex,
  hasSentryContent,
  removeRequire,
} from '../utils/ast-utils';
import {
  abortIfCancelled,
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../utils/clack';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;
import chalk from 'chalk';

const b = recast.types.builders;

export const metroConfigPath = 'metro.config.js';

export async function patchMetroWithSentryConfig() {
  const showInstructions = () =>
    showCopyPasteInstructions(
      metroConfigPath,
      getMetroWithSentryConfigSnippet(true),
    );

  const mod = await parseMetroConfig();
  if (!mod) {
    clack.log.error(
      `Could read from file ${chalk.cyan(
        metroConfigPath,
      )}, please follow the manual steps.`,
    );
    return await showInstructions();
  }

  const success = await patchMetroWithSentryConfigInMemory(
    mod,
    showInstructions,
  );
  if (!success) {
    return;
  }

  const saved = await writeMetroConfig(mod);
  if (saved) {
    clack.log.success(
      chalk.green(`${chalk.cyan(metroConfigPath)} changes saved.`),
    );
  } else {
    clack.log.warn(
      `Could not save changes to ${chalk.cyan(
        metroConfigPath,
      )}, please follow the manual steps.`,
    );
    return await showInstructions();
  }
}

export async function patchMetroWithSentryConfigInMemory(
  mod: ProxifiedModule,
  showInstructions: () => Promise<void>,
): Promise<boolean> {
  if (hasSentryContent(mod.$ast as t.Program)) {
    const shouldContinue = await confirmPathMetroConfig();
    if (!shouldContinue) {
      await showInstructions();
      return false;
    }
  }

  const configExpression = getModuleExportsAssignmentRight(
    mod.$ast as t.Program,
  );
  if (!configExpression) {
    clack.log.warn(
      'Could not find Metro config, please follow the manual steps.',
    );
    Sentry.captureException('Could not find Metro config.');
    await showInstructions();
    return false;
  }

  const wrappedConfig = wrapWithSentryConfig(configExpression);

  const replacedModuleExportsRight = replaceModuleExportsRight(
    mod.$ast as t.Program,
    wrappedConfig,
  );
  if (!replacedModuleExportsRight) {
    clack.log.warn(
      'Could not automatically wrap the config export, please follow the manual steps.',
    );
    Sentry.captureException('Could not automatically wrap the config export.');
    await showInstructions();
    return false;
  }

  const addedSentryMetroImport = addSentryMetroRequireToMetroConfig(
    mod.$ast as t.Program,
  );
  if (!addedSentryMetroImport) {
    clack.log.warn(
      'Could not add `@sentry/react-native/metro` import to Metro config, please follow the manual steps.',
    );
    Sentry.captureException(
      'Could not add `@sentry/react-native/metro` import to Metro config.',
    );
    await showInstructions();
    return false;
  }

  clack.log.success(
    `Added Sentry Metro plugin to ${chalk.cyan(metroConfigPath)}.`,
  );
  return true;
}

export async function patchMetroConfigWithSentrySerializer() {
  const showInstructions = () =>
    showCopyPasteInstructions(
      metroConfigPath,
      getMetroSentrySerializerSnippet(true),
    );

  const mod = await parseMetroConfig();
  if (!mod) {
    clack.log.error(
      `Could read from file ${chalk.cyan(
        metroConfigPath,
      )}, please follow the manual steps.`,
    );
    return await showInstructions();
  }

  if (hasSentryContent(mod.$ast as t.Program)) {
    const shouldContinue = await confirmPathMetroConfig();
    if (!shouldContinue) {
      return await showInstructions();
    }
  }

  const configObj = getMetroConfigObject(mod.$ast as t.Program);
  if (!configObj) {
    clack.log.warn(
      'Could not find Metro config object, please follow the manual steps.',
    );
    Sentry.captureException('Could not find Metro config object.');
    return showInstructions();
  }

  const addedSentrySerializer = addSentrySerializerToMetroConfig(configObj);
  if (!addedSentrySerializer) {
    clack.log.warn(
      'Could not add Sentry serializer to Metro config, please follow the manual steps.',
    );
    Sentry.captureException('Could not add Sentry serializer to Metro config.');
    return await showInstructions();
  }

  const addedSentrySerializerImport = addSentrySerializerRequireToMetroConfig(
    mod.$ast as t.Program,
  );
  if (!addedSentrySerializerImport) {
    clack.log.warn(
      'Could not add Sentry serializer import to Metro config, please follow the manual steps.',
    );
    Sentry.captureException(
      'Could not add Sentry serializer import to Metro config.',
    );
    return await showInstructions();
  }

  clack.log.success(
    `Added Sentry Metro plugin to ${chalk.cyan(metroConfigPath)}.`,
  );

  const saved = await writeMetroConfig(mod);
  if (saved) {
    clack.log.success(
      chalk.green(`${chalk.cyan(metroConfigPath)} changes saved.`),
    );
  } else {
    clack.log.warn(
      `Could not save changes to ${chalk.cyan(
        metroConfigPath,
      )}, please follow the manual steps.`,
    );
    return await showInstructions();
  }
}

export async function unPatchMetroConfig() {
  const mod = await parseMetroConfig();
  if (!mod) {
    clack.log.error(
      `Could read from file ${chalk.cyan(
        metroConfigPath,
      )}, please remove the Sentry Metro plugin manually.`,
    );
    return;
  }

  const removedAtLeastOneRequire = removeSentryRequire(mod.$ast as t.Program);
  const removedSerializerConfig = removeSentrySerializerFromMetroConfig(
    mod.$ast as t.Program,
  );

  if (removedAtLeastOneRequire || removedSerializerConfig) {
    const saved = await writeMetroConfig(mod);
    if (saved) {
      clack.log.success(
        `Removed Sentry Metro plugin from ${chalk.cyan(metroConfigPath)}.`,
      );
    }
  } else {
    clack.log.warn(
      `No Sentry Metro plugin found in ${chalk.cyan(metroConfigPath)}.`,
    );
  }
}

export function removeSentrySerializerFromMetroConfig(
  program: t.Program,
): boolean {
  const configObject = getMetroConfigObject(program);
  if (!configObject) {
    return false;
  }

  const serializerProp = getSerializerProp(configObject);
  if ('invalid' === serializerProp || 'undefined' === serializerProp) {
    return false;
  }

  const customSerializerProp = getCustomSerializerProp(serializerProp);
  if (
    'invalid' === customSerializerProp ||
    'undefined' === customSerializerProp
  ) {
    return false;
  }

  if (
    serializerProp.value.type === 'ObjectExpression' &&
    customSerializerProp.value.type === 'CallExpression' &&
    customSerializerProp.value.callee.type === 'Identifier' &&
    customSerializerProp.value.callee.name === 'createSentryMetroSerializer'
  ) {
    if (customSerializerProp.value.arguments.length === 0) {
      // FROM serializer: { customSerializer: createSentryMetroSerializer() }
      // TO serializer: {}
      let removed = false;
      serializerProp.value.properties = serializerProp.value.properties.filter(
        (p) => {
          if (
            p.type === 'ObjectProperty' &&
            p.key.type === 'Identifier' &&
            p.key.name === 'customSerializer'
          ) {
            removed = true;
            return false;
          }
          return true;
        },
      );

      if (removed) {
        return true;
      }
    } else {
      if (customSerializerProp.value.arguments[0].type !== 'SpreadElement') {
        // FROM serializer: { customSerializer: createSentryMetroSerializer(wrapperSerializer) }
        // TO serializer: { customSerializer: wrapperSerializer }
        customSerializerProp.value = customSerializerProp.value.arguments[0];
        return true;
      }
    }
  }

  return false;
}

export function removeSentryRequire(program: t.Program): boolean {
  return removeRequire(program, '@sentry');
}

export async function parseMetroConfig(): Promise<ProxifiedModule | undefined> {
  try {
    const metroConfigContent = (
      await fs.promises.readFile(metroConfigPath)
    ).toString();

    return parseModule(metroConfigContent);
  } catch (error) {
    clack.log.error(
      `Could not read Metro config file ${chalk.cyan(metroConfigPath)}`,
    );
    Sentry.captureException(error);
    return undefined;
  }
}

export async function writeMetroConfig(mod: ProxifiedModule): Promise<boolean> {
  try {
    await writeFile(mod.$ast, metroConfigPath);
  } catch (e) {
    clack.log.error(
      `Failed to write to ${chalk.cyan(metroConfigPath)}: ${JSON.stringify(e)}`,
    );
    Sentry.captureException(e);
    return false;
  }
  return true;
}

export function addSentrySerializerToMetroConfig(
  configObj: t.ObjectExpression,
): boolean {
  const serializerProp = getSerializerProp(configObj);
  if ('invalid' === serializerProp) {
    return false;
  }

  // case 1: serializer property doesn't exist yet, so we can just add it
  if ('undefined' === serializerProp) {
    configObj.properties.push(
      b.objectProperty(
        b.identifier('serializer'),
        b.objectExpression([
          b.objectProperty(
            b.identifier('customSerializer'),
            b.callExpression(b.identifier('createSentryMetroSerializer'), []),
          ),
        ]),
      ),
    );
    return true;
  }

  const customSerializerProp = getCustomSerializerProp(serializerProp);
  // case 2: serializer.customSerializer property doesn't exist yet, so we just add it
  if (
    'undefined' === customSerializerProp &&
    serializerProp.value.type === 'ObjectExpression'
  ) {
    serializerProp.value.properties.push(
      b.objectProperty(
        b.identifier('customSerializer'),
        b.callExpression(b.identifier('createSentryMetroSerializer'), []),
      ),
    );
    return true;
  }

  return false;
}

function getCustomSerializerProp(
  prop: t.ObjectProperty,
): t.ObjectProperty | 'undefined' | 'invalid' {
  const customSerializerProp =
    prop.value.type === 'ObjectExpression' &&
    prop.value.properties.find(
      (p: t.ObjectProperty) =>
        p.key.type === 'Identifier' && p.key.name === 'customSerializer',
    );

  if (!customSerializerProp) {
    return 'undefined';
  }

  if (customSerializerProp.type === 'ObjectProperty') {
    return customSerializerProp;
  }

  return 'invalid';
}

function getSerializerProp(
  obj: t.ObjectExpression,
): t.ObjectProperty | 'undefined' | 'invalid' {
  const serializerProp = obj.properties.find(
    (p: t.ObjectProperty) =>
      p.key.type === 'Identifier' && p.key.name === 'serializer',
  );

  if (!serializerProp) {
    return 'undefined';
  }

  if (serializerProp.type === 'ObjectProperty') {
    return serializerProp;
  }

  return 'invalid';
}

export function addSentrySerializerRequireToMetroConfig(
  program: t.Program,
): boolean {
  const lastRequireIndex = getLastRequireIndex(program);
  const sentrySerializerRequire = createSentrySerializerRequire();
  const sentryImportIndex = lastRequireIndex + 1;
  if (sentryImportIndex < program.body.length) {
    // insert after last require
    program.body.splice(lastRequireIndex + 1, 0, sentrySerializerRequire);
  } else {
    // insert at the beginning
    program.body.unshift(sentrySerializerRequire);
  }
  return true;
}

export function addSentryMetroRequireToMetroConfig(
  program: t.Program,
): boolean {
  const lastRequireIndex = getLastRequireIndex(program);
  const sentryMetroRequire = createSentryMetroRequire();
  const sentryImportIndex = lastRequireIndex + 1;
  if (sentryImportIndex < program.body.length) {
    // insert after last require
    program.body.splice(lastRequireIndex + 1, 0, sentryMetroRequire);
  } else {
    // insert at the beginning
    program.body.unshift(sentryMetroRequire);
  }
  return true;
}

function wrapWithSentryConfig(
  configObj: t.Identifier | t.CallExpression | t.ObjectExpression,
): t.CallExpression {
  return b.callExpression(b.identifier('withSentryConfig'), [configObj]);
}

function replaceModuleExportsRight(
  program: t.Program,
  wrappedConfig: t.CallExpression,
): boolean {
  const moduleExports = getModuleExports(program);
  if (!moduleExports) {
    return false;
  }

  if (moduleExports.expression.type === 'AssignmentExpression') {
    moduleExports.expression.right = wrappedConfig;
    return true;
  }

  return false;
}

/**
 * Creates const {createSentryMetroSerializer} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');
 */
function createSentrySerializerRequire() {
  return b.variableDeclaration('const', [
    b.variableDeclarator(
      b.objectPattern([
        b.objectProperty.from({
          key: b.identifier('createSentryMetroSerializer'),
          value: b.identifier('createSentryMetroSerializer'),
          shorthand: true,
        }),
      ]),
      b.callExpression(b.identifier('require'), [
        b.literal('@sentry/react-native/dist/js/tools/sentryMetroSerializer'),
      ]),
    ),
  ]);
}

/**
 * Creates const {withSentryConfig} = require('@sentry/react-native/metro');
 */
function createSentryMetroRequire() {
  return b.variableDeclaration('const', [
    b.variableDeclarator(
      b.objectPattern([
        b.objectProperty.from({
          key: b.identifier('withSentryConfig'),
          value: b.identifier('withSentryConfig'),
          shorthand: true,
        }),
      ]),
      b.callExpression(b.identifier('require'), [
        b.literal('@sentry/react-native/metro'),
      ]),
    ),
  ]);
}

async function confirmPathMetroConfig() {
  const shouldContinue = await abortIfCancelled(
    clack.select({
      message: `Metro Config already contains Sentry-related code. Should the wizard modify it anyway?`,
      options: [
        {
          label: 'Yes, add the Sentry Metro plugin',
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
  }

  return shouldContinue;
}

/**
 * Returns value from `module.exports = value` or `const config = value`
 */
export function getMetroConfigObject(
  program: t.Program,
): t.ObjectExpression | undefined {
  // check config variable
  const configVariable = program.body.find((s) => {
    if (
      s.type === 'VariableDeclaration' &&
      s.declarations.length === 1 &&
      s.declarations[0].type === 'VariableDeclarator' &&
      s.declarations[0].id.type === 'Identifier' &&
      s.declarations[0].id.name === 'config'
    ) {
      return true;
    }
    return false;
  }) as t.VariableDeclaration | undefined;

  if (
    configVariable?.declarations[0].type === 'VariableDeclarator' &&
    configVariable?.declarations[0].init?.type === 'ObjectExpression'
  ) {
    Sentry.setTag('metro-config', 'config-variable');
    return configVariable.declarations[0].init;
  }

  return getModuleExportsObject(program);
}

function getModuleExportsObject(
  program: t.Program,
): t.ObjectExpression | undefined {
  // check module.exports
  const moduleExports = getModuleExportsAssignmentRight(program);

  if (moduleExports?.type === 'ObjectExpression') {
    return moduleExports;
  }

  Sentry.setTag('metro-config', 'not-found');
  return undefined;
}

export function getModuleExportsAssignmentRight(
  program: t.Program,
): t.Identifier | t.CallExpression | t.ObjectExpression | undefined {
  // check module.exports
  const moduleExports = getModuleExports(program);

  if (
    moduleExports?.expression.type === 'AssignmentExpression' &&
    (moduleExports.expression.right.type === 'ObjectExpression' ||
      moduleExports.expression.right.type === 'CallExpression' ||
      moduleExports.expression.right.type === 'Identifier')
  ) {
    Sentry.setTag('metro-config', 'module-exports');
    return moduleExports?.expression.right;
  }

  Sentry.setTag('metro-config', 'not-found');
  return undefined;
}

function getModuleExports(
  program: t.Program,
): t.ExpressionStatement | undefined {
  // find module.exports
  return program.body.find((s) => {
    if (
      s.type === 'ExpressionStatement' &&
      s.expression.type === 'AssignmentExpression' &&
      s.expression.left.type === 'MemberExpression' &&
      s.expression.left.object.type === 'Identifier' &&
      s.expression.left.object.name === 'module' &&
      s.expression.left.property.type === 'Identifier' &&
      s.expression.left.property.name === 'exports'
    ) {
      return true;
    }
    return false;
  }) as t.ExpressionStatement | undefined;
}

function getMetroSentrySerializerSnippet(colors: boolean) {
  return makeCodeSnippet(colors, (unchanged, plus, _) =>
    unchanged(`const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');";
${plus(
  "const {createSentryMetroSerializer} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');",
)}

const config = {
  ${plus(`serializer: {
    customSerializer: createSentryMetroSerializer(),
  },`)}
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
`),
  );
}

function getMetroWithSentryConfigSnippet(colors: boolean) {
  return makeCodeSnippet(colors, (unchanged, plus, _) =>
    unchanged(`const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');";
${plus("const {withSentryConfig} = require('@sentry/react-native/metro');")}

const config = {};

module.exports = ${plus(
      'withSentryConfig(',
    )}mergeConfig(getDefaultConfig(__dirname), config)${plus(')')};
`),
  );
}
