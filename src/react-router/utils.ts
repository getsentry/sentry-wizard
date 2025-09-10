// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';

export function hasSentryContent(filePath: string, code: string): boolean;
export function hasSentryContent(mod: ProxifiedModule): boolean;
export function hasSentryContent(
  modOrFilePath: ProxifiedModule | string,
  code?: string,
): boolean {
  // Check if the module already has Sentry imports or content
  if (typeof modOrFilePath === 'string' && code !== undefined) {
    // String-based version for file path and code
    return (
      code.includes('@sentry/react-router') || code.includes('Sentry.init')
    );
  } else {
    // ProxifiedModule version
    const mod = modOrFilePath as ProxifiedModule;
    const moduleCode = mod.generate().code;
    return (
      moduleCode.includes('@sentry/react-router') ||
      moduleCode.includes('Sentry.init')
    );
  }
}

export function serverHasInstrumentationImport(
  filePath: string,
  code: string,
): boolean {
  // Check if the server entry already has an instrumentation import
  return (
    code.includes('./instrumentation.server') ||
    code.includes('instrumentation.server')
  );
}
