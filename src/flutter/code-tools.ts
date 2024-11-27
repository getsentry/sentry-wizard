/**
 * Returns the string index of the last import statement in the given code file.
 *
 * @param sourceCode
 * @returns the insert index, or 0 if none found.
 */
export function getLastImportLineLocation(sourceCode: string): number {
  const importRegex = /import\s+['"].*['"].*;/gim;

  let importsMatch = importRegex.exec(sourceCode);
  let importIndex = 0;
  while (importsMatch) {
    importIndex = importsMatch.index + importsMatch[0].length + 1;
    importsMatch = importRegex.exec(sourceCode);
  }
  return importIndex;
  return 0;
}
