import type { Program } from '@babel/types';

import {
  builders,
  generateCode,
  Proxified,
  type ProxifiedModule,
  // @ts-expect-error - magicast is ESM and TS complains about that. It works though
} from 'magicast';

import { getDataCollectionSnippet } from '../../utils/data-collection';

export function updateAppEntryMod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalAppModuleMod: ProxifiedModule<any>,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
  reduceDataCollection: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ProxifiedModule<any> {
  originalAppModuleMod.imports.$add({
    from: '@sentry/angular',
    imported: '*',
    local: 'Sentry',
  });

  insertInitCall(
    originalAppModuleMod,
    dsn,
    selectedFeatures,
    reduceDataCollection,
  );

  return originalAppModuleMod;
}

export function insertInitCall(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalAppModuleMod: ProxifiedModule<any>,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
  reduceDataCollection: boolean,
): void {
  const initCallArgs = getInitCallArgs(dsn, selectedFeatures);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- builders return Proxified which defaults to any
  const initCall = builders.functionCall('Sentry.init', initCallArgs);
  const originalAppModuleModAst = originalAppModuleMod.$ast as Program;

  const initCallInsertionIndex = getAfterImportsInsertionIndex(
    originalAppModuleModAst,
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- builders return Proxified which defaults to any.
  const generatedInitCode: string = generateCode(initCall).code;
  // Magicast can't express comments inside an options object, so splice the
  // commented `dataCollection` preset into the generated code before the
  // closing `})`.
  const initCode = reduceDataCollection
    ? generatedInitCode.replace(
        /\n\}\)$/,
        `,\n${getDataCollectionSnippet('    ')}\n})`,
      )
    : generatedInitCode;

  originalAppModuleModAst.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    initCode,
  );
}

type InitCallArgs = Record<
  string,
  string | number | boolean | Array<Proxified> | Record<string, boolean>
>;

export function getInitCallArgs(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): InitCallArgs {
  const initCallArgs: InitCallArgs = {
    dsn,
  };

  if (selectedFeatures.replay || selectedFeatures.performance) {
    initCallArgs.integrations = [];

    if (selectedFeatures.performance) {
      initCallArgs.integrations.push(
        builders.functionCall('Sentry.browserTracingIntegration'),
      );
      initCallArgs.tracesSampleRate = 1.0;
    }

    if (selectedFeatures.replay) {
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
