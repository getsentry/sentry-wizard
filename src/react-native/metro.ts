// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
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
} from '../utils/clack-utils';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;
import chalk from 'chalk';
import { PackageDotJson, hasPackageInstalled } from '../utils/package-json';
import { getExpoMinimalMetroConfigFileContent } from './expo.vendor';

const b = recast.types.builders;

const metroConfigPath = 'metro.config.js';

export async function patchMetroConfig(
  packageJson: PackageDotJson,
  isExpoManagedProject: boolean,
) {
  const showInstructions = () =>
    showCopyPasteInstructions(metroConfigPath, getMetroConfigSnippet(true));

  const doesConfigExist = fs.existsSync(metroConfigPath);

  if (!doesConfigExist && isExpoManagedProject) {
    return await createExpoMinimalMetroConfigWithSentry(metroConfigPath);
  }

  if (!doesConfigExist) {
    Sentry.setTag('metro-config-path', 'not-found');
    return await showInstructions();
  }

  let rawCode: string;
  try {
    rawCode = (await fs.promises.readFile(metroConfigPath)).toString();
  } catch (e) {
    Sentry.setTag('metro-config-path', 'read-failed');
    clack.log.error(`Failed to read ${chalk.cyan(metroConfigPath)}.}`);
    return await showInstructions();
  }

  const mod = await parseMetroConfig();
  if (!mod) {
    return await showInstructions();
  }

  if (hasSentryContent(mod.$ast as t.Program)) {
    const shouldContinue = await confirmPathMetroConfig();
    if (!shouldContinue) {
      return await showInstructions();
    }
  }

  const metroConfigObject = getMetroConfigObject(mod.$ast as t.Program);
  if (!metroConfigObject) {
    clack.log.warn(
      'Could not find Metro config object, please follow the manual steps.',
    );
    return showInstructions();
  }

  const addedSentrySerializer = addSentrySerializer(metroConfigObject);
  if (!addedSentrySerializer) {
    clack.log.warn(
      'Could not add Sentry serializer to Metro config, please follow the manual steps.',
    );
    return await showInstructions();
  }

  const addedSentrySerializerImport = addSentrySerializerRequireToMetroConfig(
    mod.$ast as t.Program,
  );
  if (!addedSentrySerializerImport) {
    clack.log.warn(
      'Could not add Sentry serializer import to Metro config, please follow the manual steps.',
    );
    return await showInstructions();
  }

  const addMergeConfigImport = addMergeConfigRequire(
    rawCode,
    mod.$ast as t.Program,
    packageJson,
  );
  if (!addMergeConfigImport) {
    clack.log.warn(
      'Could not add mergeConfig, please follow the manual steps.',
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

export function addSentrySerializer(config: MetroConfigObject): boolean {
  if (config.object.type === 'ObjectExpression') {
    return addSentrySerializerToObjectExpression(config.object);
  }
  if (
    config.object.type === 'CallExpression' ||
    config.object.type === 'Identifier'
  ) {
    return addSentrySerializerUsingMergeConfig(config);
  }
  return false;
}

export function addSentrySerializerUsingMergeConfig(
  config: MetroConfigObject,
): boolean {
  const mergeConfigCall = b.callExpression.from({
    callee: b.identifier('mergeConfig'),
    arguments: [
      config.object,
      b.objectExpression.from({
        properties: [
          b.objectProperty.from({
            key: b.identifier('serializer'),
            value: b.objectExpression.from({
              properties: [
                b.objectProperty.from({
                  key: b.identifier('customSerializer'),
                  value: b.callExpression.from({
                    callee: b.identifier('createSentryMetroSerializer'),
                    arguments: [],
                  }),
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });

  if (
    config.owner.type === 'VariableDeclaration' &&
    config.owner.declarations.length === 1 &&
    config.owner.declarations[0].type === 'VariableDeclarator'
  ) {
    config.owner.declarations[0].init = mergeConfigCall;
    return true;
  }
  if (
    config.owner.type === 'AssignmentExpression' &&
    (config.owner.right.type === 'CallExpression' ||
      config.owner.right.type === 'Identifier')
  ) {
    config.owner.right = mergeConfigCall;
    return true;
  }
  return false;
}

export function addMergeConfigRequire(
  rawCode: string,
  program: t.Program,
  packageJson: PackageDotJson,
): boolean {
  if (rawCode.includes('mergeConfig')) {
    return true;
  }

  const lastRequireIndex = getLastRequireIndex(program);
  const mergeConfigRequire = createMergeConfigRequire(packageJson);
  const mergeConfigIndex = lastRequireIndex + 1;
  if (mergeConfigIndex < program.body.length) {
    // insert after last require
    program.body.splice(lastRequireIndex + 1, 0, mergeConfigRequire);
  } else {
    // insert at the end
    program.body.push(mergeConfigRequire);
  }
  return true;
}

/**
 * Based on installed packages, returns the package name of the metro config package.
 */
export function getMetroConfigPackageName(packageJson: PackageDotJson): string {
  // since RN 0.73
  const isReactNativeMetroConfigInstalled = hasPackageInstalled(
    '@react-native/metro-config',
    packageJson,
  );

  if (isReactNativeMetroConfigInstalled) {
    return '@react-native/metro-config';
  }

  // before RN 0.73 (metro version 0.66 and newer)
  return 'metro';
}

/**
 * Creates const {mergeConfig} = require('@react-native/metro-config');
 */
export function createMergeConfigRequire(packageJson: PackageDotJson) {
  return b.variableDeclaration('const', [
    b.variableDeclarator(
      b.objectPattern([
        b.objectProperty.from({
          key: b.identifier('mergeConfig'),
          value: b.identifier('mergeConfig'),
          shorthand: true,
        }),
      ]),
      b.callExpression(b.identifier('require'), [
        b.literal(getMetroConfigPackageName(packageJson)),
      ]),
    ),
  ]);
}

export async function unPatchMetroConfig() {
  const mod = await parseMetroConfig();
  if (!mod) {
    await showCopyPasteInstructions(
      metroConfigPath,
      getMetroConfigSnippet(true, false),
      "Couldn't parse Metro config. Please follow the manual steps.",
    );
    return;
  }

  const removedAtLeastOneRequire = removeSentryRequire(mod.$ast as t.Program);
  const removedSerializerConfig = await removeSentrySerializerFromMetroConfig(
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

export async function removeSentrySerializerFromMetroConfig(
  program: t.Program,
): Promise<boolean> {
  const config = getMetroConfigObject(program);
  if (!config || config.object.type !== 'ObjectExpression') {
    await showCopyPasteInstructions(
      metroConfigPath,
      getMetroConfigSnippet(true, false),
      "Couldn't parse Metro config. Please follow the manual steps.",
    );
    return false;
  }

  const serializerProp = getSerializerProp(config.object);
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

async function parseMetroConfig(): Promise<ProxifiedModule | null> {
  try {
    const metroConfigContent = (
      await fs.promises.readFile(metroConfigPath)
    ).toString();

    return parseModule(metroConfigContent);
  } catch (error) {
    Sentry.setTag('metro-config-path', 'parse-failed');
  }
  return null;
}

async function writeMetroConfig(mod: ProxifiedModule): Promise<boolean> {
  try {
    await writeFile(mod.$ast, metroConfigPath);
  } catch (e) {
    clack.log.error(
      `Failed to write to ${chalk.cyan(metroConfigPath)}: ${JSON.stringify(e)}`,
    );
    return false;
  }
  return true;
}

export function addSentrySerializerToObjectExpression(
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
    // insert at the end
    program.body.push(sentrySerializerRequire);
  }
  return true;
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

export interface MetroConfigObject {
  object: t.ObjectExpression | t.CallExpression | t.Identifier;
  owner: t.VariableDeclaration | t.AssignmentExpression;
}

/**
 * Returns value from `module.exports = value` or `const config = value`
 */
export function getMetroConfigObject(
  program: t.Program,
): MetroConfigObject | undefined {
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
    (configVariable?.declarations[0].init?.type === 'ObjectExpression' ||
      configVariable?.declarations[0].init?.type === 'CallExpression' ||
      configVariable?.declarations[0].init?.type === 'Identifier')
  ) {
    Sentry.setTag('metro-config', 'config-variable');
    return {
      object: configVariable.declarations[0].init,
      owner: configVariable,
    };
  }

  // check module.exports
  const moduleExports = program.body.find((s) => {
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

  if (
    moduleExports?.expression.type === 'AssignmentExpression' &&
    (moduleExports?.expression.right.type === 'ObjectExpression' ||
      moduleExports?.expression.right.type === 'CallExpression' ||
      moduleExports?.expression.right.type === 'Identifier')
  ) {
    Sentry.setTag('metro-config', 'module-exports');
    return {
      object: moduleExports?.expression.right,
      owner: moduleExports.expression,
    };
  }

  Sentry.setTag('metro-config', 'not-found');
  return undefined;
}

async function createExpoMinimalMetroConfigWithSentry(
  configPath: string,
): Promise<void> {
  try {
    await fs.promises.writeFile(
      configPath,
      getExpoMinimalMetroConfigFileContent(),
      { encoding: 'utf-8' },
    );
    Sentry.setTag('metro-config-path', 'write-expo-minimal-success');
    clack.log.success(
      `Created ${chalk.cyan(metroConfigPath)} with Sentry Metro plugin.`,
    );
  } catch (e) {
    clack.log.error(
      `Failed to create ${chalk.cyan(metroConfigPath)}: ${JSON.stringify(e)}`,
    );
    Sentry.setTag('metro-config-path', 'write-expo-minimal-failed');
    await showCopyPasteInstructions(
      configPath,
      getExpoMinimalMetroConfigFileContent(),
    );
  }
}

function getMetroConfigSnippet(colors: boolean, install = true) {
  return makeCodeSnippet(colors, (unchanged, plus, minus) => {
    const modified = install ? plus : minus;
    return unchanged(`const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');";
${modified(
  "const {createSentryMetroSerializer} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');",
)}

const config = {
  ${modified(`serializer: {
    customSerializer: createSentryMetroSerializer(),
  },`)}
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
`);
  });
}
