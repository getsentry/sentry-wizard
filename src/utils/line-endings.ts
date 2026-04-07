import * as fs from 'fs';
import * as path from 'path';
import { getUncommittedOrUntrackedFiles } from './git';

/**
 * Fixes mixed line endings in files modified by the wizard.
 *
 * When the wizard reads a CRLF file and inserts content with hardcoded \n,
 * the result is mixed line endings. This function detects files with CRLF
 * and normalizes all line endings to CRLF.
 *
 * Call this at the end of a wizard run, similar to runPrettierIfInstalled().
 */
export function fixLineEndings(): void {
  const files = getUncommittedOrUntrackedFiles()
    .map((f) => (f.startsWith('- ') ? f.slice(2) : f))
    .filter(Boolean);

  for (const file of files) {
    const filePath = path.resolve(file);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes('\r\n')) {
      continue;
    }

    // File has CRLF — normalize all line endings to CRLF
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, normalized, 'utf8');
  }
}
