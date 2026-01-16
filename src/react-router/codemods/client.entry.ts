/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import * as recast from 'recast';
import * as path from 'path';
import type { namedTypes as t } from 'ast-types';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';
import { hasSentryContent } from '../../utils/ast-utils';
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
    const filename = path.basename(clientEntryPath);
    clack.log.info(`Sentry initialization found in ${chalk.cyan(filename)}`);
    return;
  }

  clientEntryAst.imports.$add({
    from: '@sentry/react-router',
    imported: '*',
    local: 'Sentry',
  });

  const integrations = [];
  if (enableTracing) {
    integrations.push('Sentry.reactRouterTracingIntegration()');
  }
  if (enableReplay) {
    integrations.push('Sentry.replayIntegration()');
  }

  const initContent = `
Sentry.init({
  dsn: "${dsn}",
  sendDefaultPii: true,
  integrations: [${integrations.join(', ')}],
  ${enableLogs ? 'enableLogs: true,' : ''}
  tracesSampleRate: ${enableTracing ? '1.0' : '0'},${
    enableTracing
      ? '\n  tracePropagationTargets: [/^\\//, /^https:\\/\\/yourserver\\.io\\/api/],'
      : ''
  }${
    enableReplay
      ? '\n  replaysSessionSampleRate: 0.1,\n  replaysOnErrorSampleRate: 1.0,'
      : ''
  }
});`;

  (clientEntryAst.$ast as t.Program).body.splice(
    getAfterImportsInsertionIndex(clientEntryAst.$ast as t.Program),
    0,
    ...recast.parse(initContent).program.body,
  );

  await writeFile(clientEntryAst.$ast, clientEntryPath);
}
