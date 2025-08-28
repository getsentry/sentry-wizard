// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
import type { Program } from '@babel/types';

export function getAfterImportsInsertionIndex(mod: ProxifiedModule): number {
  // Find the index after the last import statement
  const body = (mod.$ast as Program).body;
  let insertionIndex = 0;

  for (let i = 0; i < body.length; i++) {
    const node = body[i];
    if (node.type === 'ImportDeclaration') {
      insertionIndex = i + 1;
    } else {
      break;
    }
  }

  return insertionIndex;
}

export function hasSentryContent(mod: ProxifiedModule): boolean {
  // Check if the module already has Sentry imports or content
  const code = mod.generate().code;
  return code.includes('@sentry/react-router') || code.includes('Sentry.init');
}

export function serverHasInstrumentationImport(mod: ProxifiedModule): boolean {
  // Check if the server entry already has an instrumentation import
  const code = mod.generate().code;
  return (
    code.includes('./instrument.server') || code.includes('instrument.server')
  );
}
