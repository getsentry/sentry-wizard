/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { Program } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, type ProxifiedModule } from 'magicast';

export function updateAppEntryMod(
  originalAppModuleMod: ProxifiedModule<any>,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): ProxifiedModule<any> {
  originalAppModuleMod.imports.$add({
    from: '@sentry/angular',
    imported: '*',
    local: 'Sentry',
  });

  insertInitCall(originalAppModuleMod, dsn, selectedFeatures);

  return originalAppModuleMod;
}

export function insertInitCall(
  originalAppModuleMod: ProxifiedModule<any>,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): void {
  const initCallArgs = getInitCallArgs(dsn, selectedFeatures);
  const initCall = builders.functionCall('Sentry.init', initCallArgs);
  const originalAppModuleModAst = originalAppModuleMod.$ast as Program;

  const initCallInsertionIndex = getAfterImportsInsertionIndex(
    originalAppModuleModAst,
  );

  originalAppModuleModAst.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );
}

export function getInitCallArgs(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): Record<string, unknown> {
  const initCallArgs = {
    dsn,
  } as Record<string, unknown>;

  if (selectedFeatures.replay || selectedFeatures.performance) {
    initCallArgs.integrations = [];

    if (selectedFeatures.performance) {
      // @ts-expect-error - Adding Proxified AST node to the array
      initCallArgs.integrations.push(
        builders.functionCall('Sentry.browserTracingIntegration'),
      );
      initCallArgs.tracesSampleRate = 1.0;
    }

    if (selectedFeatures.replay) {
      // @ts-expect-error - Adding Proxified AST node to the array
      initCallArgs.integrations.push(
        builders.functionCall('Sentry.replayIntegration'),
      );

      initCallArgs.replaysSessionSampleRate = 0.1;
      initCallArgs.replaysOnErrorSampleRate = 1.0;
    }
  }

  return initCallArgs;
}

/**
 * We want to insert the handleError function just after all imports
 */
export function getAfterImportsInsertionIndex(
  originalEntryServerModAST: Program,
): number {
  for (let x = originalEntryServerModAST.body.length - 1; x >= 0; x--) {
    if (originalEntryServerModAST.body[x].type === 'ImportDeclaration') {
      return x + 1;
    }
  }

  return 0;
}
