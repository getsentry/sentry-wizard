/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';

import * as recast from 'recast';
import type { namedTypes as t } from 'ast-types';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, loadFile, writeFile } from 'magicast';
import { debug } from '../../utils/debug';
import {
  hasSentryContent,
  safeCalleeIdentifierMatch,
  safeGetIdentifierName,
} from '../../utils/ast-utils';
import { getAfterImportsInsertionIndex } from './utils';

export async function instrumentServerEntry(
  serverEntryPath: string,
): Promise<void> {
  const serverEntryAst = await loadFile(serverEntryPath);

  if (!hasSentryContent(serverEntryAst.$ast as t.Program)) {
    serverEntryAst.imports.$add({
      from: '@sentry/react-router',
      imported: '*',
      local: 'Sentry',
    });
  }

  instrumentHandleError(serverEntryAst);
  instrumentHandleRequest(serverEntryAst);

  await writeFile(serverEntryAst.$ast, serverEntryPath);
}

export function instrumentHandleRequest(
  originalEntryServerMod: ProxifiedModule<any>,
): void {
  const originalEntryServerModAST = originalEntryServerMod.$ast as t.Program;

  const defaultServerEntryExport = originalEntryServerModAST.body.find(
    (node) => {
      return node.type === 'ExportDefaultDeclaration';
    },
  );

  if (!defaultServerEntryExport) {
    clack.log.warn(
      `Could not find function ${chalk.cyan(
        'handleRequest',
      )} in your server entry file. Creating one for you.`,
    );

    let foundServerRouterImport = false;
    let foundRenderToPipeableStreamImport = false;
    let foundCreateReadableStreamFromReadableImport = false;

    originalEntryServerMod.imports.$items.forEach((item) => {
      if (item.imported === 'ServerRouter' && item.from === 'react-router') {
        foundServerRouterImport = true;
      }
      if (
        item.imported === 'renderToPipeableStream' &&
        item.from === 'react-dom/server'
      ) {
        foundRenderToPipeableStreamImport = true;
      }
      if (
        item.imported === 'createReadableStreamFromReadable' &&
        item.from === '@react-router/node'
      ) {
        foundCreateReadableStreamFromReadableImport = true;
      }
    });

    if (!foundServerRouterImport) {
      originalEntryServerMod.imports.$add({
        from: 'react-router',
        imported: 'ServerRouter',
        local: 'ServerRouter',
      });
    }

    if (!foundRenderToPipeableStreamImport) {
      originalEntryServerMod.imports.$add({
        from: 'react-dom/server',
        imported: 'renderToPipeableStream',
        local: 'renderToPipeableStream',
      });
    }

    if (!foundCreateReadableStreamFromReadableImport) {
      originalEntryServerMod.imports.$add({
        from: '@react-router/node',
        imported: 'createReadableStreamFromReadable',
        local: 'createReadableStreamFromReadable',
      });
    }

    const implementation =
      recast.parse(`handleRequest = Sentry.createSentryHandleRequest({
  ServerRouter,
  renderToPipeableStream,
  createReadableStreamFromReadable,
})`).program.body[0];

    originalEntryServerModAST.body.splice(
      getAfterImportsInsertionIndex(originalEntryServerModAST),
      0,
      {
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [implementation],
      },
    );

    originalEntryServerModAST.body.push({
      type: 'ExportDefaultDeclaration',
      declaration: {
        type: 'Identifier',
        name: 'handleRequest',
      },
    });
  } else if (
    defaultServerEntryExport &&
    // @ts-expect-error - StatementKind works here because the AST is proxified by magicast
    generateCode(defaultServerEntryExport).code.includes(
      'wrapSentryHandleRequest',
    )
  ) {
    debug('wrapSentryHandleRequest is already used, skipping wrapping again');
  } else {
    let defaultExportNode: recast.types.namedTypes.ExportDefaultDeclaration | null =
      null;
    const defaultExportIndex = originalEntryServerModAST.body.findIndex(
      (node) => {
        const found = node.type === 'ExportDefaultDeclaration';

        if (found) {
          defaultExportNode = node;
        }

        return found;
      },
    );

    if (defaultExportIndex !== -1 && defaultExportNode !== null) {
      recast.visit(defaultExportNode, {
        visitCallExpression(path) {
          if (
            safeCalleeIdentifierMatch(path.value.callee, 'pipe') &&
            path.value.arguments.length &&
            path.value.arguments[0].type === 'Identifier' &&
            safeGetIdentifierName(path.value.arguments[0]) === 'body'
          ) {
            const wrapped = recast.types.builders.callExpression(
              recast.types.builders.memberExpression(
                recast.types.builders.identifier('Sentry'),
                recast.types.builders.identifier('getMetaTagTransformer'),
              ),
              [path.value.arguments[0]],
            );

            path.value.arguments[0] = wrapped;
          }

          this.traverse(path);
        },
      });

      // Replace the existing default export with the wrapped one
      originalEntryServerModAST.body.splice(
        defaultExportIndex,
        1,
        // @ts-expect-error - declaration works here because the AST is proxified by magicast
        defaultExportNode.declaration,
      );

      // Adding our wrapped export
      originalEntryServerModAST.body.push(
        recast.types.builders.exportDefaultDeclaration(
          recast.types.builders.callExpression(
            recast.types.builders.memberExpression(
              recast.types.builders.identifier('Sentry'),
              recast.types.builders.identifier('wrapSentryHandleRequest'),
            ),
            [recast.types.builders.identifier('handleRequest')],
          ),
        ),
      );
    }
  }
}

export function instrumentHandleError(
  originalEntryServerMod: ProxifiedModule<any>,
): void {
  const originalEntryServerModAST = originalEntryServerMod.$ast as t.Program;

  const handleErrorFunctionExport = originalEntryServerModAST.body.find(
    (node) => {
      return (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id?.name === 'handleError'
      );
    },
  );

  const handleErrorFunctionVariableDeclarationExport =
    originalEntryServerModAST.body.find((node) => {
      if (
        node.type !== 'ExportNamedDeclaration' ||
        node.declaration?.type !== 'VariableDeclaration'
      ) {
        return false;
      }

      const declarations = node.declaration.declarations;
      if (!declarations || declarations.length === 0) {
        return false;
      }

      const firstDeclaration = declarations[0];
      if (!firstDeclaration || firstDeclaration.type !== 'VariableDeclarator') {
        return false;
      }

      const id = firstDeclaration.id;
      return id && id.type === 'Identifier' && id.name === 'handleError';
    });

  if (
    !handleErrorFunctionExport &&
    !handleErrorFunctionVariableDeclarationExport
  ) {
    clack.log.warn(
      `Could not find function ${chalk.cyan(
        'handleError',
      )} in your server entry file. Creating one for you.`,
    );

    const implementation =
      recast.parse(`const handleError = Sentry.createSentryHandleError({
  logErrors: false
})`).program.body[0];

    originalEntryServerModAST.body.splice(
      getAfterImportsInsertionIndex(originalEntryServerModAST),
      0,
      recast.types.builders.exportNamedDeclaration(implementation),
    );
  } else if (
    (handleErrorFunctionExport &&
      // @ts-expect-error - StatementKind works here because the AST is proxified by magicast
      generateCode(handleErrorFunctionExport).code.includes(
        'captureException',
      )) ||
    (handleErrorFunctionVariableDeclarationExport &&
      // @ts-expect-error - StatementKind works here because the AST is proxified by magicast
      generateCode(handleErrorFunctionVariableDeclarationExport).code.includes(
        'captureException',
      ))
  ) {
    debug(
      'Found captureException inside handleError, skipping adding it again',
    );
  } else if (
    (handleErrorFunctionExport &&
      // @ts-expect-error - StatementKind works here because the AST is proxified by magicast
      generateCode(handleErrorFunctionExport).code.includes(
        'createSentryHandleError',
      )) ||
    (handleErrorFunctionVariableDeclarationExport &&
      // @ts-expect-error - StatementKind works here because the AST is proxified by magicast
      generateCode(handleErrorFunctionVariableDeclarationExport).code.includes(
        'createSentryHandleError',
      ))
  ) {
    debug('createSentryHandleError is already used, skipping adding it again');
  } else if (handleErrorFunctionExport) {
    // Create the Sentry captureException call as an IfStatement
    const sentryCall = recast.parse(`if (!request.signal.aborted) {
  Sentry.captureException(error);
}`).program.body[0];

    // Safely insert the Sentry call at the beginning of the handleError function body
    // @ts-expect-error - declaration works here because the AST is proxified by magicast
    const declaration = handleErrorFunctionExport.declaration;
    if (
      declaration &&
      declaration.body &&
      declaration.body.body &&
      Array.isArray(declaration.body.body)
    ) {
      declaration.body.body.unshift(sentryCall);
    } else {
      debug(
        'Cannot safely access handleError function body, skipping instrumentation',
      );
    }
  } else if (handleErrorFunctionVariableDeclarationExport) {
    // Create the Sentry captureException call as an IfStatement
    const sentryCall = recast.parse(`if (!request.signal.aborted) {
  Sentry.captureException(error);
}`).program.body[0];

    // Safe access to existing handle error implementation with proper null checks
    // We know this is ExportNamedDeclaration with VariableDeclaration from the earlier find
    const exportDeclaration =
      handleErrorFunctionVariableDeclarationExport as any;
    if (
      !exportDeclaration.declaration ||
      exportDeclaration.declaration.type !== 'VariableDeclaration' ||
      !exportDeclaration.declaration.declarations ||
      exportDeclaration.declaration.declarations.length === 0
    ) {
      debug(
        'Cannot safely access handleError variable declaration, skipping instrumentation',
      );
      return;
    }

    const firstDeclaration = exportDeclaration.declaration.declarations[0];
    if (
      !firstDeclaration ||
      firstDeclaration.type !== 'VariableDeclarator' ||
      !firstDeclaration.init
    ) {
      debug(
        'Cannot safely access handleError variable declarator init, skipping instrumentation',
      );
      return;
    }

    const existingHandleErrorImplementation = firstDeclaration.init;
    const existingParams = existingHandleErrorImplementation.params;
    const existingBody = existingHandleErrorImplementation.body;

    const requestParam = {
      ...recast.types.builders.property(
        'init',
        recast.types.builders.identifier('request'), // key
        recast.types.builders.identifier('request'), // value
      ),
      shorthand: true,
    };
    // Add error and {request} parameters to handleError function if not present
    // When none of the parameters exist
    if (existingParams.length === 0) {
      existingParams.push(
        recast.types.builders.identifier('error'),
        recast.types.builders.objectPattern([requestParam]),
      );
      // When only error parameter exists
    } else if (existingParams.length === 1) {
      existingParams.push(recast.types.builders.objectPattern([requestParam]));
      // When both parameters exist, but request is not destructured
    } else if (
      existingParams[1].type === 'ObjectPattern' &&
      !existingParams[1].properties.some(
        (prop: t.ObjectProperty) =>
          safeGetIdentifierName(prop.key) === 'request',
      )
    ) {
      existingParams[1].properties.push(requestParam);
    }

    // Add the Sentry call to the function body
    existingBody.body.push(sentryCall);
  }
}
