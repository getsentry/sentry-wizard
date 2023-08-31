import * as fs from 'fs';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { ProxifiedModule } from 'magicast';

/**
 * Checks if a file where we don't know its concrete file type yet exists
 * and returns the full path to the file with the correct file type.
 */
export function findFile(
  filePath: string,
  fileTypes: string[] = ['.js', '.ts', '.mjs'],
): string | undefined {
  return fileTypes
    .map((type) => `${filePath}${type}`)
    .find((file) => fs.existsSync(file));
}

/** Checks if a Sentry package is already mentioned in the file */
export function hasSentryContent(mod: ProxifiedModule<object>): boolean {
  const imports = mod.imports.$items.map((i) => i.from);
  return !!imports.find((i) => i.startsWith('@sentry/'));
}
