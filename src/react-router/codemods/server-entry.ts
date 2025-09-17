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
import { debug } from 'console';
import { hasSentryContent } from '../../utils/ast-utils';

/**
 * We want to insert the handleError function just after all imports
 */
export function getAfterImportsInsertionIndex(
  originalEntryServerModAST: t.Program,
): number {
  for (let x = originalEntryServerModAST.body.length - 1; x >= 0; x--) {
    if (originalEntryServerModAST.body[x].type === 'ImportDeclaration') {
      return x + 1;
    }
  }

  return 0;
}

export async function instrumentServerEntry(
  serverEntryPath: string,
): Promise<boolean> {
  const serverEntryAst = await loadFile(serverEntryPath);

  if (!hasSentryContent(serverEntryAst.$ast as t.Program)) {
    serverEntryAst.imports.$add({
      from: '@sentry/react-router',
      imported: '*',
      local: 'Sentry',
    });
  }

  instrumentHandleError(serverEntryAst);

  await writeFile(serverEntryAst.$ast, serverEntryPath);

  return false;
}

export function instrumentHandleError(
  // MagicAst returns `ProxifiedModule<any>` so therefore we have to use `any` here
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalEntryServerMod: ProxifiedModule<any>,
): boolean {
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
    originalEntryServerModAST.body.find(
      (node) =>
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'VariableDeclaration' &&
        // @ts-expect-error - id should always have a name in this case
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        node.declaration.declarations[0].id.name === 'handleError',
    );

  if (
    !handleErrorFunctionExport &&
    !handleErrorFunctionVariableDeclarationExport
  ) {
    clack.log.warn(
      `Could not find function ${chalk.cyan(
        'handleError',
      )} in your server entry file. Creating one for you.`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const implementation =
      recast.parse(`const handleError = Sentry.createSentryHandleError({
  logErrors: false
})`).program.body[0];

    originalEntryServerModAST.body.splice(
      getAfterImportsInsertionIndex(originalEntryServerModAST),
      0,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
      'Found captureException inside handleError, skipping instrumentation',
    );
    return false;
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
    debug('createSentryHandleError is already used, skipping instrumentation');
    return false;
  } else if (handleErrorFunctionExport) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const implementation = recast.parse(`if (!request.signal.aborted) {
  Sentry.captureException(error);
}`).program.body[0];
    // If the current handleError function has a body, we need to merge the new implementation with the existing one
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    implementation.declarations[0].init.arguments[0].body.body.unshift(
      // @ts-expect-error - declaration works here because the AST is proxified by magicast
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ...handleErrorFunctionExport.declaration.body.body,
    );

    // @ts-expect-error - declaration works here because the AST is proxified by magicast
    handleErrorFunctionExport.declaration = implementation;
  } else if (handleErrorFunctionVariableDeclarationExport) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const implementation = recast.parse(`if (!request.signal.aborted) {
  Sentry.captureException(new Error('Request aborted'));
}`).program.body[0];
    const existingHandleErrorImplementation =
        // @ts-expect-error - declaration works here because the AST is proxified by magicast

      handleErrorFunctionVariableDeclarationExport.declaration.declarations[0]
        .init;
    const existingParams = existingHandleErrorImplementation.params;
    const existingBody = existingHandleErrorImplementation.body;

    const requestParam = {
      ...recast.types.builders.property(
        'init',
        recast.types.builders.identifier('request'),
        recast.types.builders.identifier('request'),
      ),
      shorthand: true,
    };
    // Add error and {request} parameters to handleError function if not present

    // None of the parameters exist
    if (existingParams.length === 0) {
      existingParams.push(
        recast.types.builders.identifier('error'),
        recast.types.builders.objectPattern([requestParam]),
      );
      // Only error parameter exists
    } else if (existingParams.length === 1) {
      existingParams.push(recast.types.builders.objectPattern([requestParam]));
      // Both parameters exist, but request is not destructured
    } else if (
      existingParams[1].type === 'ObjectPattern' &&
      !existingParams[1].properties.some(
        (prop: t.ObjectProperty) =>
          prop.key.type === 'Identifier' && prop.key.name === 'request',
      )
    ) {
      existingParams[1].properties.push(requestParam);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    existingBody.body.push(implementation);
  }

  return true;
}
