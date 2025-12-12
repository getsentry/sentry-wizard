import type { namedTypes as t } from 'ast-types';
import * as recast from 'recast';
import * as path from 'path';
import * as fs from 'fs';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule, generateCode } from 'magicast';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import { findProperty } from '../../utils/ast-utils';

/**
 * Extracts the ObjectExpression from various export patterns.
 * Supports: direct object, `satisfies Config`, and `as Config` patterns.
 */
function extractConfigObject(
  declaration: t.Declaration | t.Expression,
): t.ObjectExpression | undefined {
  if (declaration.type === 'ObjectExpression') {
    return declaration as t.ObjectExpression;
  }

  if (
    declaration.type === 'TSSatisfiesExpression' ||
    declaration.type === 'TSAsExpression'
  ) {
    const expr = (declaration as t.TSSatisfiesExpression | t.TSAsExpression)
      .expression;
    return expr.type === 'ObjectExpression' ? expr : undefined;
  }

  return undefined;
}

/**
 * Creates an identifier property for object literals.
 */
function createIdentifierProperty(name: string): t.Property {
  const b = recast.types.builders;
  return b.property('init', b.identifier(name), b.identifier(name));
}

export function addSentryBuildEndToReactRouterConfig(program: t.Program): {
  success: boolean;
  ssrWasChanged: boolean;
} {
  const b = recast.types.builders;
  let ssrWasChanged = false;

  const defaultExport = program.body.find(
    (node) => node.type === 'ExportDefaultDeclaration',
  ) as t.ExportDefaultDeclaration | undefined;

  if (!defaultExport) {
    return { success: false, ssrWasChanged: false };
  }

  const configObj = extractConfigObject(defaultExport.declaration);

  if (!configObj) {
    return { success: false, ssrWasChanged: false };
  }

  const buildEndProp = findProperty(configObj, 'buildEnd');

  if (buildEndProp) {
    throw new Error(
      'A buildEnd hook already exists in your React Router config.',
    );
  }

  const ssrProp = findProperty(configObj, 'ssr');

  if (!ssrProp) {
    const ssrProperty = b.objectProperty(
      b.identifier('ssr'),
      b.booleanLiteral(true),
    );
    ssrProperty.comments = [
      {
        type: 'CommentLine',
        value:
          ' SSR is required for Sentry sourcemap uploads to work correctly',
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    ];
    configObj.properties.unshift(ssrProperty);
    ssrWasChanged = true;
  } else if (
    ssrProp.value.type === 'BooleanLiteral' ||
    ssrProp.value.type === 'Literal'
  ) {
    const wasExplicitlyFalse = ssrProp.value.value === false;

    if (wasExplicitlyFalse) {
      ssrWasChanged = true;
    }

    ssrProp.value = b.booleanLiteral(true);

    if (wasExplicitlyFalse) {
      ssrProp.comments = [
        {
          type: 'CommentLine',
          value:
            ' Changed to true - SSR is required for Sentry sourcemap uploads',
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      ];
    }
  }

  const paramNames = ['viteConfig', 'reactRouterConfig', 'buildManifest'];

  const buildEndFunction = b.arrowFunctionExpression(
    [b.objectPattern(paramNames.map(createIdentifierProperty))],
    b.blockStatement([
      b.expressionStatement(
        b.awaitExpression(
          b.callExpression(b.identifier('sentryOnBuildEnd'), [
            b.objectExpression(paramNames.map(createIdentifierProperty)),
          ]),
        ),
      ),
    ]),
  );
  buildEndFunction.async = true;

  configObj.properties.push(
    b.objectProperty(b.identifier('buildEnd'), buildEndFunction),
  );

  return { success: true, ssrWasChanged };
}

export function hasReactRouterSentryContent(program: t.Program): boolean {
  let hasSentry = false;

  recast.visit(program, {
    visitIdentifier(path) {
      if (path.node.name === 'sentryOnBuildEnd') {
        hasSentry = true;
        return false; // stop traversal
      }
      this.traverse(path);
    },
  });

  return hasSentry;
}

export async function instrumentReactRouterConfig(
  isTS: boolean,
): Promise<{ ssrWasChanged: boolean }> {
  const configFilename = `react-router.config.${isTS ? 'ts' : 'js'}`;
  const configPath = path.join(process.cwd(), configFilename);

  if (!fs.existsSync(configPath)) {
    const defaultConfig = isTS
      ? `import type { Config } from "@react-router/dev/config";
import { sentryOnBuildEnd } from "@sentry/react-router";

export default {
  ssr: true,
  buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
    await sentryOnBuildEnd({ viteConfig, reactRouterConfig, buildManifest });
  },
} satisfies Config;
`
      : `import { sentryOnBuildEnd } from "@sentry/react-router";

export default {
  ssr: true,
  buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
    await sentryOnBuildEnd({ viteConfig, reactRouterConfig, buildManifest });
  },
};
`;
    await fs.promises.writeFile(configPath, defaultConfig);
    return { ssrWasChanged: false };
  }

  const configContent = await fs.promises.readFile(configPath, 'utf-8');
  const filename = chalk.cyan(configFilename);

  const mod = parseModule(configContent);

  if (hasReactRouterSentryContent(mod.$ast as t.Program)) {
    clack.log.info(`${filename} already contains sentryOnBuildEnd.`);
    return { ssrWasChanged: false };
  }

  mod.imports.$add({
    from: '@sentry/react-router',
    imported: 'sentryOnBuildEnd',
    local: 'sentryOnBuildEnd',
  });

  const { success, ssrWasChanged } = addSentryBuildEndToReactRouterConfig(
    mod.$ast as t.Program,
  );

  if (!success) {
    throw new Error('Failed to modify React Router config structure');
  }

  const code = generateCode(mod.$ast).code;
  await fs.promises.writeFile(configPath, code);

  return { ssrWasChanged };
}
