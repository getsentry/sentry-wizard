// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { ProxifiedModule, parseModule, writeFile } from 'magicast';

import { PackageDotJson, hasPackageInstalled } from '../utils/package-json';
import * as Sentry from '@sentry/node';
import {
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../utils/clack-utils';
import { RNCliSetupConfigContent } from './react-native-wizard';
import { traceStep } from '../telemetry';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;
const b = recast.types.builders;

export const SENTRY_EXPO_PLUGIN_NAME = '@sentry/react-native/expo';
export const DEPRECATED_SENTRY_EXPO_PLUGIN_NAME = 'sentry-expo';

export const SENTRY_PLUGIN_FUNCTION_NAME = 'withSentry';

const APP_CONFIG_TS = `app.config.ts`;
const APP_CONFIG_JS = `app.config.js`;
const APP_CONFIG_JSON = `app.config.json`;

export interface AppConfigJson {
  plugins: Array<[string, undefined | Record<string, unknown>]>;
}

/**
 * Checks if the project is managed by Expo
 * based on the main entry in package.json
 * and expo package presence in dependencies.
 */
export function isExpoManagedProject(
  projectPackageJson: PackageDotJson,
): boolean {
  const hasExpoEntry =
    projectPackageJson.main === 'node_modules/expo/AppEntry.js';
  const hasExpoInstalled = hasPackageInstalled('expo', projectPackageJson);

  return hasExpoEntry && hasExpoInstalled;
}

export function printSentryExpoMigrationOutro(): void {
  clack.outro(
    `Deprecated ${chalk.cyan(
      'sentry-expo',
    )} package installed in your dependencies. Please follow the migration guide at ${chalk.cyan(
      'https://docs.sentry.io/platforms/react-native/manual-setup/',
    )}`,
  );
}

/**
 * Finds app.config.{js, ts, json} in the project root and add Sentry Expo `withSentry` plugin.
 */
export async function patchExpoAppConfig(options: RNCliSetupConfigContent) {
  const appConfigTsExists = fs.existsSync(APP_CONFIG_TS);
  const appConfigJsExists = fs.existsSync(APP_CONFIG_JS);
  const appConfigJsonExists = fs.existsSync(APP_CONFIG_JSON);

  const appConfigPathFound =
    appConfigTsExists || appConfigJsExists || appConfigJsonExists;

  Sentry.setTag(
    'app-config-file-status',
    appConfigPathFound ? 'found' : 'not-found',
  );
  if (!appConfigPathFound) {
    clack.log.warn(
      `Could not find ${chalk.cyan('app.config.{js, ts, json}')}.`,
    );
    await showCopyPasteInstructions(
      'app.config.js',
      getSentryAppConfigJavascriptCodeSnippet(options),
      'This ensures auto upload of source maps during native app build.',
    );
    return;
  }

  if (appConfigJsonExists) {
    // app.config.json
    const patched = await patchAppConfigJson(APP_CONFIG_JSON, options);
    return (
      !patched &&
      (await showCopyPasteInstructions(
        APP_CONFIG_JSON,
        getSentryAppConfigJsonCodeSnippet(options),
        'This ensures auto upload of source maps during native app build.',
      ))
    );
  }

  if (appConfigTsExists && appConfigJsExists) {
    // app.config.ts
    const patched = await patchAppConfigTypescript(APP_CONFIG_TS, options);
    return (
      !patched &&
      (await showCopyPasteInstructions(
        APP_CONFIG_TS,
        getSentryAppConfigJavascriptCodeSnippet(options),
        'This ensures auto upload of source maps during native app build.',
      ))
    );
  }

  if (appConfigJsExists) {
    // app.config.js
    const patched = await patchAppConfigJavascript(APP_CONFIG_JS, options);
    return (
      !patched &&
      (await showCopyPasteInstructions(
        APP_CONFIG_JS,
        getSentryAppConfigJavascriptCodeSnippet(options),
        'This ensures auto upload of source maps during native app build.',
      ))
    );
  }
}

async function patchAppConfigJson(
  path: string,
  options: RNCliSetupConfigContent,
): Promise<boolean> {
  const appConfigContent = (
    await fs.promises.readFile(path, { encoding: 'utf-8' })
  ).toString();
  const patchedContent = traceStep('app-config-json-patch', () =>
    addWithSentryToAppConfigJson(appConfigContent, options),
  );
  if (patchedContent === null) {
    return false;
  }

  try {
    await fs.promises.writeFile(path, patchedContent);
  } catch (error) {
    Sentry.setTag('app-config-file-status', 'json-write-error');
    clack.log.error(`Unable to write ${chalk.cyan('app.config.json')}.`);
    return false;
  }
  Sentry.setTag('app-config-file-status', 'json-write-success');
  clack.log.success(
    `Added Sentry Expo plugin to ${chalk.cyan('app.config.json')}.`,
  );
  return true;
}

async function patchAppConfigJavascript(
  path: string,
  options: RNCliSetupConfigContent,
): Promise<boolean> {
  const config = await parseAppConfig(path);
  if (!config) {
    return false;
  }

  if (config.raw.includes(SENTRY_PLUGIN_FUNCTION_NAME)) {
    clack.log.warn(
      `Your ${chalk.cyan(path)} already includes the Sentry Expo plugin.`,
    );
    return false;
  }

  const exportsModule = getModuleExports(config.parsed.$ast as t.Program);
  if (!exportsModule) {
    clack.log.error(
      `Unable to find ${chalk.cyan('module.exports')} in ${chalk.cyan(path)}.`,
    );
    return false;
  }

  if (
    exportsModule.right.type !== 'CallExpression' &&
    exportsModule.right.type !== 'Identifier' &&
    exportsModule.right.type !== 'ObjectExpression'
  ) {
    clack.log.error(
      `Expected ${chalk.cyan(
        'module.exports',
      )} to be a function, an identifier or an object.`,
    );
    return false;
  }

  exportsModule.right = wrapWithSentry(exportsModule.right, options);

  addExpoPluginRequire(config.parsed.$ast as t.Program);

  try {
    await writeFile(config.parsed.$ast, path);
  } catch (error) {
    clack.log.error(`Unable to write ${chalk.cyan(path)}.`);
    return false;
  }

  clack.log.success(`Added Sentry Expo plugin to ${chalk.cyan(path)}.`);
  return true;
}

export function getModuleExports(
  program: t.Program,
): t.AssignmentExpression | null {
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

  if (moduleExports?.expression.type === 'AssignmentExpression') {
    return moduleExports.expression;
  }

  return null;
}

export function addExpoPluginRequire(program: t.Program): void {
  const requireSentry = b.variableDeclaration('const', [
    b.variableDeclarator(
      b.objectPattern([
        b.objectProperty.from({
          key: b.identifier(SENTRY_PLUGIN_FUNCTION_NAME),
          value: b.identifier(SENTRY_PLUGIN_FUNCTION_NAME),
          shorthand: true,
        }),
      ]),
      b.callExpression(b.identifier('require'), [
        b.literal(SENTRY_EXPO_PLUGIN_NAME),
      ]),
    ),
  ]);

  program.body.unshift(requireSentry);
}

async function patchAppConfigTypescript(
  path: string,
  options: RNCliSetupConfigContent,
): Promise<boolean> {
  const config = await parseAppConfig(path);
  if (!config) {
    return false;
  }

  if (config.raw.includes(SENTRY_PLUGIN_FUNCTION_NAME)) {
    clack.log.warn(
      `Your ${chalk.cyan(path)} already includes the Sentry Expo plugin.`,
    );
    return false;
  }

  const exportDefault = getExportDefault(config.parsed.$ast as t.Program);
  if (!exportDefault) {
    clack.log.error(
      `Unable to find ${chalk.cyan('export default')} in ${chalk.cyan(path)}.`,
    );
    return false;
  }

  if (
    exportDefault.declaration.type !== 'CallExpression' &&
    exportDefault.declaration.type !== 'Identifier' &&
    exportDefault.declaration.type !== 'ObjectExpression'
  ) {
    clack.log.error(
      `Expected ${chalk.cyan(
        'export default',
      )} to be a function, an identifier or an object.`,
    );
    return false;
  }

  exportDefault.declaration = wrapWithSentry(
    exportDefault.declaration,
    options,
  );

  addExpoPluginImport(config.parsed.$ast as t.Program);

  try {
    await writeFile(config.parsed.$ast, path);
  } catch (error) {
    clack.log.error(`Unable to write ${chalk.cyan(path)}.`);
    return false;
  }

  clack.log.success(`Added Sentry Expo plugin to ${chalk.cyan(path)}.`);
  return true;
}

export function getExportDefault(
  program: t.Program,
): t.ExportDefaultDeclaration | null {
  const exportDefault = program.body.find((s) => {
    if (s.type === 'ExportDefaultDeclaration') {
      return true;
    }
    return false;
  }) as t.ExportDefaultDeclaration | undefined;

  return exportDefault ?? null;
}

export function addExpoPluginImport(program: t.Program): void {
  const importSentry = b.importDeclaration(
    [
      b.importSpecifier(
        b.identifier(SENTRY_PLUGIN_FUNCTION_NAME),
        b.identifier(SENTRY_PLUGIN_FUNCTION_NAME),
      ),
    ],
    b.literal(SENTRY_EXPO_PLUGIN_NAME),
  );
  program.body.unshift(importSentry);
}

export function wrapWithSentry(
  originalPlugin: t.CallExpression | t.Identifier | t.ObjectExpression,
  options: RNCliSetupConfigContent,
): t.CallExpression {
  return b.callExpression(b.identifier(SENTRY_PLUGIN_FUNCTION_NAME), [
    originalPlugin,
    b.objectExpression([
      b.objectProperty.from({
        key: b.identifier('url'),
        value: b.literal(options.url),
      }),
      b.objectProperty.from({
        key: b.identifier('authToken'),
        value: b.literal(options.authToken),
        comments: [
          b.commentLine(
            ' DO NOT COMMIT YOUR AUTH TOKEN, USE SENTRY_AUTH_TOKEN ENVIRONMENT VARIABLE INSTEAD',
            false,
            true,
          ),
        ],
      }),
      b.objectProperty.from({
        key: b.identifier('project'),
        value: b.literal(options.project),
      }),
      b.objectProperty.from({
        key: b.identifier('organization'),
        value: b.literal(options.org),
      }),
    ]),
  ]);
}

async function parseAppConfig(
  path: string,
): Promise<{ raw: string; parsed: ProxifiedModule } | null> {
  try {
    const content = (await fs.promises.readFile(path)).toString();

    return {
      raw: content,
      parsed: parseModule(content),
    };
  } catch (error) {
    clack.log.error(
      `Unable to parse your ${chalk.cyan(
        path,
      )}. Make sure it has a valid format!`,
    );
    Sentry.setTag('app-config-file-status', 'parse-failed');
  }
  return null;
}

export function addWithSentryToAppConfigJson(
  appConfigContent: string,
  options: RNCliSetupConfigContent,
): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsedAppConfig: AppConfigJson = JSON.parse(appConfigContent);
    const includesWithSentry =
      appConfigContent.includes(SENTRY_EXPO_PLUGIN_NAME) ||
      appConfigContent.includes(DEPRECATED_SENTRY_EXPO_PLUGIN_NAME);

    if (includesWithSentry) {
      clack.log.warn(
        `Your ${chalk.cyan(
          'app.config.json',
        )} already includes the Sentry Expo plugin.`,
      );
      return null;
    }

    parsedAppConfig.plugins.push([
      SENTRY_EXPO_PLUGIN_NAME,
      {
        url: options.url,
        warning:
          'DO NOT COMMIT YOUR AUTH TOKEN, USE SENTRY_AUTH_TOKEN ENVIRONMENT VARIABLE INSTEAD',
        authToken: options.authToken,
        project: options.project,
        organization: options.org,
      },
    ]);

    return JSON.stringify(parsedAppConfig, null, 2);
  } catch (error) {
    clack.log.error(
      `Unable to parse your ${chalk.cyan(
        'app.config.json',
      )}. Make sure it has a valid format!`,
    );
  }
  return null;
}

export function getSentryAppConfigJsonCodeSnippet({
  url,
  project,
  org,
}: Omit<RNCliSetupConfigContent, 'authToken'>) {
  return makeCodeSnippet(true, (unchanged, plus, _minus) => {
    return unchanged(`{
  "name": "my app",
  "plugins": [
    ${plus(`[
      "@sentry/react-native/expo",
      {
        "url": "${url}",
        "warning": "DO NOT COMMIT YOUR AUTH TOKEN, USE SENTRY_AUTH_TOKEN ENVIRONMENT VARIABLE INSTEAD",
        "authToken": "YOUR_AUTH_TOKEN", // DO NOT COMMIT
        "project": "${project}",
        "organization": "${org}"
      }
    ]`)}
  ],
}`);
  });
}

export function getSentryAppConfigJavascriptCodeSnippet({
  url,
  project,
  org,
}: Omit<RNCliSetupConfigContent, 'authToken'>) {
  return makeCodeSnippet(true, (_unchanged, plus, _minus) => {
    return _unchanged(`${plus(
      "const { withSentry } = require('@sentry/react-native/expo');",
    )}

const config = {
  name: "My App",
};

${plus(`module.exports = withSentry(config, {
  url: '${url}',
  // Use SENTRY_AUTH_TOKEN environment variable
  authToken: 'YOUR_AUTH_TOKEN', // DO NOT COMMIT
  project: '${project}',
  organization: '${org}',
});`)}`);
  });
}
