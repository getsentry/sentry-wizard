import * as fs from 'fs';

import { debug } from '../utils/debug';

export function findFilesWithExtension(
  dir: string,
  extension: string,
): string[] {
  debug(`Searching for files with extension: ${extension} at path: ${dir}`);
  const files = fs.readdirSync(dir);
  debug(`Found ${files.length} files in ${dir}`);
  const found = files.filter((file) => file.endsWith(extension));
  debug(`Found ${found.length} files with extension ${extension}`);
  found.forEach((file) => debug(`  ${file}`));
  return found;
}
