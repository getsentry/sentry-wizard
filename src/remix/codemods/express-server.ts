// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as recast from 'recast';
import { visit } from 'ast-types';
import {
  ASTNode,
  ProxifiedImportItem,
  generateCode,
  loadFile,
  writeFile,
  // @ts-expect-error - magicast is ESM and TS complains about that. It works though
} from 'magicast';
import type { Program } from '@babel/types';
import * as fs from 'fs';

import { getInitCallInsertionIndex, hasSentryContent } from '../utils';
import { findFile } from '../../utils/ast-utils';

// Find `loadViteServerBuild` or `unstable_loadViteServerBuild` call inside an arrow function
// and replace it with await loadViteServerBuild.
// For context, see: https://github.com/getsentry/sentry-javascript/issues/9500
export function updateViteBuildParameter(node: ASTNode) {
  const hasViteConfig = findFile('vite.config');

  if (!hasViteConfig) {
    return;
  }

  visit(node, {
    visitArrowFunctionExpression(path) {
      if (
        path.value.body.type === 'CallExpression' &&
        path.value.body.callee.type === 'Identifier' &&
        (path.value.body.callee.name === 'unstable_loadViteServerBuild' ||
          path.value.body.callee.name === 'loadViteServerBuild')
      ) {
        // Replace the arrow function with a call to await loadViteServerBuild
        path.replace(recast.types.builders.awaitExpression(path.value.body));
      }

      this.traverse(path);
    },
  });
}

// Try to find the Express server implementation that contains `createRequestHandler` from `@remix-run/express`
export async function findCustomExpressServerImplementation() {
  const possiblePaths = [
    'server',
    'server/index',
    'app/server',
    'app/server/index',
  ];

  for (const filePath of possiblePaths) {
    const filename = findFile(filePath);

    if (!filename) {
      continue;
    }

    const fileStat = fs.statSync(filename);

    if (!fileStat.isFile()) {
      continue;
    }

    const fileMod = await loadFile(filename);
    const createRequestHandlerImport = fileMod.imports.$items.find(
      (imp) =>
        imp.from === '@remix-run/express' &&
        imp.imported === 'createRequestHandler',
    );

    if (createRequestHandlerImport) {
      return filename;
    }
  }

  return null;
}

// Wrap createRequestHandler with `wrapExpressCreateRequestHandler` from `@sentry/remix`
export async function instrumentExpressCreateRequestHandler(
  expressServerPath: string,
): Promise<boolean> {
  const originalExpressServerMod = await loadFile(expressServerPath);

  if (
    hasSentryContent(
      generateCode(originalExpressServerMod.$ast).code,
      originalExpressServerMod.$code,
    )
  ) {
    clack.log.warn(
      `Express server in ${chalk.cyan(
        expressServerPath,
      )} already has Sentry instrumentation. Skipping.`,
    );

    return false;
  }

  originalExpressServerMod.imports.$add({
    from: '@sentry/remix',
    imported: 'wrapExpressCreateRequestHandler',
    local: 'wrapExpressCreateRequestHandler',
  });

  const createRequestHandlerImport =
    originalExpressServerMod.imports.$items.find(
      (imp) =>
        imp.from === '@remix-run/express' &&
        imp.imported === 'createRequestHandler',
    );

  visit(originalExpressServerMod.$ast, {
    visitIdentifier(path) {
      if (
        path.value.name === 'createRequestHandler' &&
        path.parentPath.value.type === 'CallExpression'
      ) {
        path.value.name = 'sentryCreateRequestHandler';
      }

      this.traverse(path);
    },
  });

  // Insert the const declaration right after the imports
  // Where we want to insert the const declaration is the same as where we would want to insert the init call.
  const insertionIndex = getInitCallInsertionIndex(
    originalExpressServerMod.$ast as Program,
  );

  const createRequestHandlerConst = wrapCreateRequestHandlerWithSentry(
    createRequestHandlerImport,
  );

  if (!createRequestHandlerConst) {
    // Todo: throw error
  }

  (originalExpressServerMod.$ast as Program).body.splice(
    insertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    createRequestHandlerConst,
  );

  // Update the Vite build parameter to await loadViteServerBuild if everything goes well.
  // This should be the last thing we do.
  updateViteBuildParameter(originalExpressServerMod.$ast);

  try {
    await writeFile(originalExpressServerMod.$ast, expressServerPath);

    clack.log.info(
      `Successfully instrumented Express server in ${chalk.cyan(
        expressServerPath,
      )}.`,
    );
  } catch (e) {
    clack.log.warn(
      `Could not write to Express server in ${chalk.cyan(expressServerPath)}.`,
    );

    throw e;
  }

  return true;
}

// Wrap `createRequestHandler` with `wrapExpressCreateRequestHandler` and set const name to `sentryCreateRequestHandler`
export function wrapCreateRequestHandlerWithSentry(
  createRequestHandlerImport: ProxifiedImportItem | undefined,
) {
  if (!createRequestHandlerImport) {
    return;
  }

  const createRequestHandler = createRequestHandlerImport.local;

  const wrapCreateRequestHandler = recast.types.builders.callExpression(
    recast.types.builders.identifier('wrapExpressCreateRequestHandler'),
    [recast.types.builders.identifier(createRequestHandler)],
  );

  return recast.types.builders.variableDeclaration('const', [
    recast.types.builders.variableDeclarator(
      recast.types.builders.identifier('sentryCreateRequestHandler'),
      wrapCreateRequestHandler,
    ),
  ]);
}
