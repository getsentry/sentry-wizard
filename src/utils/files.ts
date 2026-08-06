import * as fs from 'node:fs';
import * as path from 'node:path';

import { debug } from './debug';

export function findFilesWithExtension(
  directory: string,
  extension: string,
): string[] {
  return findFiles(directory, (filePath) => filePath.endsWith(extension));
}

export function findFilesWithName(
  directory: string,
  fileName: string,
): string[] {
  return findFiles(
    directory,
    (filePath) => path.basename(filePath) === fileName,
  );
}

function findFiles(
  directory: string,
  predicate: (filePath: string) => boolean,
): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    debug('Could not read directory while finding files:', directory, error);
    return [];
  }

  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findFiles(entryPath, predicate);
    }

    return predicate(entryPath) ? [entryPath] : [];
  });
}
