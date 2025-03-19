/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
import type { Program } from '@babel/types';

import * as recast from 'recast';

import { HANDLE_ERROR_TEMPLATE_V2 } from '../templates';
import { getAfterImportsInsertionIndex, hasSentryContent } from '../utils';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode } from 'magicast';

export function instrumentHandleError(
  // MagicAst returns `ProxifiedModule<any>` so therefore we have to use `any` here
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalEntryServerMod: ProxifiedModule<any>,
  serverEntryFilename: string,
): boolean {
  const originalEntryServerModAST = originalEntryServerMod.$ast as Program;

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
        node.declaration.declarations[0].id.name === 'handleError',
    );

  if (
    !handleErrorFunctionExport &&
    !handleErrorFunctionVariableDeclarationExport
  ) {
    clack.log.warn(
      `Could not find function ${chalk.cyan('handleError')} in ${chalk.cyan(
        serverEntryFilename,
      )}. Creating one for you.`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const implementation = recast.parse(HANDLE_ERROR_TEMPLATE_V2).program
      .body[0];

    originalEntryServerModAST.body.splice(
      getAfterImportsInsertionIndex(originalEntryServerModAST),
      0,
      // @ts-expect-error - string works here because the AST is proxified by magicast
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      recast.types.builders.exportNamedDeclaration(implementation),
    );
  } else if (
    (handleErrorFunctionExport &&
      ['wrapHandleErrorWithSentry', 'sentryHandleError'].some((util) =>
        hasSentryContent(
          generateCode(handleErrorFunctionExport).code,
          originalEntryServerMod.$code,
          util,
        ),
      )) ||
    (handleErrorFunctionVariableDeclarationExport &&
      ['wrapHandleErrorWithSentry', 'sentryHandleError'].some((util) =>
        hasSentryContent(
          generateCode(handleErrorFunctionVariableDeclarationExport).code,
          originalEntryServerMod.$code,
          util,
        ),
      ))
  ) {
    return false;
  } else if (handleErrorFunctionExport) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const implementation = recast.parse(HANDLE_ERROR_TEMPLATE_V2).program
      .body[0];

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
    const implementation = recast.parse(HANDLE_ERROR_TEMPLATE_V2).program
      .body[0];

    // If the current handleError function has a body, we need to merge the new implementation with the existing one
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    implementation.declarations[0].init.arguments[0].body.body.unshift(
      // @ts-expect-error - declaration works here because the AST is proxified by magicast
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ...handleErrorFunctionVariableDeclarationExport.declaration
        .declarations[0].init.body.body,
    );

    // @ts-expect-error - declaration works here because the AST is proxified by magicast
    handleErrorFunctionVariableDeclarationExport.declaration = implementation;
  }

  return true;
}
