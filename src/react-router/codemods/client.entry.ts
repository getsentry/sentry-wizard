/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import * as recast from 'recast';
import type { namedTypes as t } from 'ast-types';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';
import { hasSentryContent } from '../../utils/ast-utils';
import { getSentryInitClientContent } from '../templates';
import { getAfterImportsInsertionIndex } from './utils';

export async function instrumentClientEntry(
  clientEntryPath: string,
  dsn: string,
  enableTracing: boolean,
  enableReplay: boolean,
  enableLogs: boolean,
): Promise<void> {
  const clientEntryAst = await loadFile(clientEntryPath);

  if (hasSentryContent(clientEntryAst.$ast as t.Program)) {
    clack.log.info(`Sentry initialization found in ${clientEntryPath}`);
    return;
  }

  clientEntryAst.imports.$add({
    from: '@sentry/react-router',
    imported: '*',
    local: 'Sentry',
  });

  const initContent = getSentryInitClientContent(
    dsn,
    enableTracing,
    enableReplay,
    enableLogs,
  );

  (clientEntryAst.$ast as t.Program).body.splice(
    getAfterImportsInsertionIndex(clientEntryAst.$ast as t.Program),
    0,
    ...recast.parse(initContent).program.body,
  );

  await writeFile(clientEntryAst.$ast, clientEntryPath);
}
