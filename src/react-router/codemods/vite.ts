import type { namedTypes as t } from 'ast-types';
import * as recast from 'recast';
import * as path from 'path';
import * as fs from 'fs';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule, generateCode } from 'magicast';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  hasSentryContent,
  findProperty,
  preserveTrailingNewline,
} from '../../utils/ast-utils';

/**
 * Extracts ObjectExpression from function body.
 * Handles both arrow functions with object returns and block statements with explicit returns.
 *
 * - Arrow with object-return: (config) => ({ ... })
 * - Arrow with block: (config) => { return { ... }; }
 * - Function with block: function(config) { return { ... }; }
 *
 * @param body - The function body to extract from
 * @returns The ObjectExpression if found, undefined otherwise
 */
function extractFromFunctionBody(
  body: t.Expression | t.BlockStatement,
): t.ObjectExpression | undefined {
  if (body.type === 'ObjectExpression') {
    return body as t.ObjectExpression;
  }

  if (body.type === 'BlockStatement') {
    const blockBody = body as t.BlockStatement;
    const returnStatement = blockBody.body.find(
      (stmt: t.Statement): stmt is t.ReturnStatement =>
        stmt.type === 'ReturnStatement',
    );

    return returnStatement?.argument?.type === 'ObjectExpression'
      ? returnStatement.argument
      : undefined;
  }

  return undefined;
}

/**
 * Creates the sentryReactRouter Vite plugin call expression.
 *
 * Generates AST for:
 * sentryReactRouter({
 *   org: "...",
 *   project: "...",
 *   authToken: process.env.SENTRY_AUTH_TOKEN
 * }, config)
 *
 * @param orgSlug - Sentry organization slug
 * @param projectSlug - Sentry project slug
 * @returns CallExpression node for the Sentry Vite plugin
 */
function createSentryPluginCall(
  orgSlug: string,
  projectSlug: string,
): t.CallExpression {
  const b = recast.types.builders;
  return b.callExpression(b.identifier('sentryReactRouter'), [
    b.objectExpression([
      b.objectProperty(b.identifier('org'), b.stringLiteral(orgSlug)),
      b.objectProperty(b.identifier('project'), b.stringLiteral(projectSlug)),
      b.objectProperty(
        b.identifier('authToken'),
        b.memberExpression(
          b.memberExpression(b.identifier('process'), b.identifier('env')),
          b.identifier('SENTRY_AUTH_TOKEN'),
        ),
      ),
    ]),
    b.identifier('config'),
  ]);
}

export function addReactRouterPluginToViteConfig(
  program: t.Program,
  orgSlug: string,
  projectSlug: string,
): { success: boolean; wasConverted: boolean } {
  const b = recast.types.builders;
  let wasConverted = false;

  const defaultExport = program.body.find(
    (node) => node.type === 'ExportDefaultDeclaration',
  ) as t.ExportDefaultDeclaration | undefined;

  if (!defaultExport) {
    return { success: false, wasConverted: false };
  }

  let configObj: t.ObjectExpression | undefined;
  let defineConfigCall: t.CallExpression | undefined;

  if (
    defaultExport.declaration.type === 'CallExpression' &&
    defaultExport.declaration.callee.type === 'Identifier' &&
    defaultExport.declaration.callee.name === 'defineConfig'
  ) {
    defineConfigCall = defaultExport.declaration;

    // Early exit if not single argument
    if (defineConfigCall.arguments.length !== 1) {
      return { success: false, wasConverted: false };
    }

    const arg = defineConfigCall.arguments[0];

    if (arg.type === 'ObjectExpression') {
      configObj = arg;
      // Convert to function form
      const arrowFunction = b.arrowFunctionExpression(
        [b.identifier('config')],
        configObj,
      );
      defineConfigCall.arguments[0] = arrowFunction;
      wasConverted = true;
    } else if (
      arg.type === 'ArrowFunctionExpression' ||
      arg.type === 'FunctionExpression'
    ) {
      configObj = extractFromFunctionBody(arg.body);
    }
  }

  if (!configObj) {
    return { success: false, wasConverted };
  }

  const pluginsProp = findProperty(configObj, 'plugins');
  const sentryPluginCall = createSentryPluginCall(orgSlug, projectSlug);

  if (!pluginsProp) {
    configObj.properties.push(
      b.objectProperty(
        b.identifier('plugins'),
        b.arrayExpression([sentryPluginCall]),
      ),
    );
  } else if (
    pluginsProp.value.type === 'ArrayExpression' &&
    pluginsProp.type === 'ObjectProperty'
  ) {
    const arrayExpr = pluginsProp.value;
    // Defensive: ensure elements array exists
    if (!arrayExpr.elements) {
      arrayExpr.elements = [];
    }
    arrayExpr.elements.push(sentryPluginCall);
  } else {
    return { success: false, wasConverted };
  }

  return { success: true, wasConverted };
}

export async function instrumentViteConfig(
  orgSlug: string,
  projectSlug: string,
): Promise<{ wasConverted: boolean }> {
  const configPath = fs.existsSync(path.join(process.cwd(), 'vite.config.ts'))
    ? path.join(process.cwd(), 'vite.config.ts')
    : path.join(process.cwd(), 'vite.config.js');

  if (!fs.existsSync(configPath)) {
    throw new Error('Could not find vite.config.ts or vite.config.js');
  }

  const configContent = await fs.promises.readFile(configPath, 'utf-8');
  const filename = chalk.cyan(path.basename(configPath));

  const mod = parseModule(configContent);

  if (hasSentryContent(mod.$ast as t.Program)) {
    clack.log.info(`${filename} already contains sentryReactRouter plugin.`);
    return { wasConverted: false };
  }

  mod.imports.$add({
    from: '@sentry/react-router',
    imported: 'sentryReactRouter',
    local: 'sentryReactRouter',
  });

  const { success, wasConverted } = addReactRouterPluginToViteConfig(
    mod.$ast as t.Program,
    orgSlug,
    projectSlug,
  );

  if (!success) {
    throw new Error('Failed to modify Vite config structure');
  }

  const code = preserveTrailingNewline(
    configContent,
    generateCode(mod.$ast).code,
  );
  await fs.promises.writeFile(configPath, code);

  return { wasConverted };
}
