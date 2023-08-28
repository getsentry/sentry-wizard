/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
import type { Program } from '@babel/types';

import * as recast from 'recast';

import { HANDLE_ERROR_TEMPLATE_V2 } from '../templates';
import { getInitCallInsertionIndex, hasSentryContent } from '../utils';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode } from 'magicast';

export function instrumentHandleError(
  originalEntryServerMod: ProxifiedModule<any>,
  serverEntryFilename: string,
): boolean {
  const originalEntryServerModAST = originalEntryServerMod.$ast as Program;

  const handleErrorFunction = originalEntryServerModAST.body.find(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      node.declaration.id?.name === 'handleError',
  );

  if (!handleErrorFunction) {
    clack.log.warn(
      `Could not find function ${chalk.cyan('handleError')} in ${chalk.cyan(
        serverEntryFilename,
      )}. Creating one for you.`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const implementation = recast.parse(HANDLE_ERROR_TEMPLATE_V2).program
      .body[0];

    originalEntryServerModAST.body.splice(
      getInitCallInsertionIndex(originalEntryServerModAST),
      0,
      // @ts-expect-error - string works here because the AST is proxified by magicast
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      recast.types.builders.exportNamedDeclaration(implementation),
    );
  } else if (
    hasSentryContent(
      generateCode(handleErrorFunction).code,
      originalEntryServerMod.$code,
    )
  ) {
    return false;
  } else {
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    handleErrorFunction.declaration.body.body.unshift(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recast.parse(HANDLE_ERROR_TEMPLATE_V2).program.body[0].body.body[0],
    );
  }

  return true;
}
