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
  useInstrumentationAPI = false,
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

  let initContent: string;

  if (useInstrumentationAPI && enableTracing) {
    const integrations = ['tracing'];
    if (enableReplay) {
      integrations.push('Sentry.replayIntegration()');
    }

    initContent = `
const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });

Sentry.init({
  dsn: "${dsn}",
  sendDefaultPii: true,
  integrations: [${integrations.join(', ')}],
  ${enableLogs ? 'enableLogs: true,' : ''}
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/^\\//, /^https:\\/\\/yourserver\\.io\\/api/],${
    enableReplay
      ? '\n  replaysSessionSampleRate: 0.1,\n  replaysOnErrorSampleRate: 1.0,'
      : ''
  }
});`;
  } else {
    const integrations = [];
    if (enableTracing) {
      integrations.push('Sentry.reactRouterTracingIntegration()');
    }
    if (enableReplay) {
      integrations.push('Sentry.replayIntegration()');
    }

    initContent = `
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
  }

  (clientEntryAst.$ast as t.Program).body.splice(
    getAfterImportsInsertionIndex(clientEntryAst.$ast as t.Program),
    0,
    ...recast.parse(initContent).program.body,
  );

  if (useInstrumentationAPI && enableTracing) {
    const hydratedRouterFound = addInstrumentationPropsToHydratedRouter(
      clientEntryAst.$ast as t.Program,
    );

    if (!hydratedRouterFound) {
      clack.log.warn(
        `Could not find ${chalk.cyan(
          'HydratedRouter',
        )} component in your client entry file.\n` +
          `To use the Instrumentation API, manually add the ${chalk.cyan(
            'unstable_instrumentations',
          )} prop:\n` +
          `  ${chalk.green(
            '<HydratedRouter unstable_instrumentations={[tracing.clientInstrumentation]} />',
          )}`,
      );
    }
  }

  await writeFile(clientEntryAst.$ast, clientEntryPath);
}

function addInstrumentationPropsToHydratedRouter(ast: t.Program): boolean {
  let found = false;

  recast.visit(ast, {
    visitJSXElement(path) {
      const openingElement = path.node.openingElement;

      if (
        openingElement.name.type === 'JSXIdentifier' &&
        openingElement.name.name === 'HydratedRouter'
      ) {
        found = true;

        const hasInstrumentationsProp = openingElement.attributes?.some(
          (attr) =>
            attr.type === 'JSXAttribute' &&
            attr.name.type === 'JSXIdentifier' &&
            attr.name.name === 'unstable_instrumentations',
        );

        if (!hasInstrumentationsProp) {
          const instrumentationsProp = recast.types.builders.jsxAttribute(
            recast.types.builders.jsxIdentifier('unstable_instrumentations'),
            recast.types.builders.jsxExpressionContainer(
              recast.types.builders.arrayExpression([
                recast.types.builders.memberExpression(
                  recast.types.builders.identifier('tracing'),
                  recast.types.builders.identifier('clientInstrumentation'),
                ),
              ]),
            ),
          );

          if (!openingElement.attributes) {
            openingElement.attributes = [];
          }
          openingElement.attributes.push(instrumentationsProp);
        }

        return false;
      }

      this.traverse(path);
    },
  });

  return found;
}
