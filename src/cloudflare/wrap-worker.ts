import * as recast from 'recast';
import type { namedTypes as t } from 'ast-types';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { hasSentryContent } from '../utils/ast-utils';
import chalk from 'chalk';
import { ExpressionKind } from 'ast-types/lib/gen/kinds';

const b = recast.types.builders;

/**
 * Wraps a Cloudflare Worker's default export with Sentry.withSentry()
 *
 * Before:
 * ```
 * export default {
 *   async fetch(request, env, ctx) { ... }
 * } satisfies ExportedHandler<Env>;
 * ```
 *
 * After:
 * ```
 * import * as Sentry from '@sentry/cloudflare';
 *
 * export default Sentry.withSentry(
 *   (env) => ({
 *     dsn: 'your-dsn',
 *     tracesSampleRate: 1,
 *   }),
 *   {
 *     async fetch(request, env, ctx) { ... }
 *   } satisfies ExportedHandler<Env>
 * );
 * ```
 *
 * @param workerFilePath - Path to the worker file to wrap
 * @param dsn - Sentry DSN for initialization
 * @param selectedFeatures - Feature flags for optional Sentry features
 */
export async function wrapWorkerWithSentry(
  workerFilePath: string,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    logs: boolean;
  },
): Promise<void> {
  const workerAst = await loadFile(workerFilePath);

  if (hasSentryContent(workerAst.$ast as t.Program)) {
    clack.log.warn(
      `Sentry is already configured in ${chalk.cyan(
        workerFilePath,
      )}. Skipping wrapping with Sentry.`,
    );
    return;
  }

  workerAst.imports.$add({
    from: '@sentry/cloudflare',
    imported: '*',
    local: 'Sentry',
  });

  recast.visit(workerAst.$ast, {
    visitExportDefaultDeclaration(path) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const originalDeclaration = path.value.declaration as ExpressionKind;
      const sentryConfig = createSentryConfigFunction(dsn, selectedFeatures);
      const wrappedExport = b.callExpression(
        b.memberExpression(b.identifier('Sentry'), b.identifier('withSentry')),
        [sentryConfig, originalDeclaration],
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      path.value.declaration = wrappedExport;

      return false;
    },
  });

  await writeFile(workerAst.$ast, workerFilePath);
}

/**
 * Creates the Sentry config function: (env) => ({ dsn: '...', ... })
 */
function createSentryConfigFunction(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    logs: boolean;
  },
): t.ArrowFunctionExpression {
  const configProperties: t.ObjectProperty[] = [
    b.objectProperty(b.identifier('dsn'), b.stringLiteral(dsn)),
  ];

  if (selectedFeatures.performance) {
    const tracesSampleRateProperty = b.objectProperty(
      b.identifier('tracesSampleRate'),
      b.numericLiteral(1),
    );

    tracesSampleRateProperty.comments = [
      b.commentLine(
        ' Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.',
        true,
        false,
      ),
    ];

    configProperties.push(tracesSampleRateProperty);
  }

  if (selectedFeatures.logs) {
    const enableLogsProperty = b.objectProperty(
      b.identifier('enableLogs'),
      b.booleanLiteral(true),
    );

    enableLogsProperty.comments = [
      b.commentLine(' Enable logs to be sent to Sentry', true, false),
    ];

    configProperties.push(enableLogsProperty);
  }

  const configObject = b.objectExpression(configProperties);

  return b.arrowFunctionExpression([b.identifier('env')], configObject);
}
