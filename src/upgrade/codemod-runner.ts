import * as fs from 'fs';
import * as recast from 'recast';
import type {
  CodemodTransform,
  CodemodResult,
  ManualReviewItem,
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const babelTsParser = require('recast/parsers/babel-ts');

export interface RunResult {
  filesModified: number;
  totalChanges: string[];
  manualReviewItems: ManualReviewItem[];
  errors: { file: string; error: string }[];
}

export function runCodemodsOnFile(
  filePath: string,
  sourceCode: string,
  transforms: CodemodTransform[],
): { output: string; result: CodemodResult } {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
  const ast = recast.parse(sourceCode, { parser: babelTsParser });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const program = ast.program as recast.types.namedTypes.Program;

  let anyModified = false;
  const allChanges: string[] = [];
  const allManualReview: ManualReviewItem[] = [];

  for (const transform of transforms) {
    const result = transform.transform({
      program,
      filePath,
      sourceCode,
    });

    if (result.modified) {
      anyModified = true;
    }
    allChanges.push(...result.changes);
    allManualReview.push(...result.manualReviewItems);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const output = recast.print(ast).code;

  return {
    output,
    result: {
      modified: anyModified,
      changes: allChanges,
      manualReviewItems: allManualReview,
    },
  };
}

export function runCodemodsOnFiles(
  files: string[],
  transforms: CodemodTransform[],
): RunResult {
  let filesModified = 0;
  const totalChanges: string[] = [];
  const manualReviewItems: ManualReviewItem[] = [];
  const errors: { file: string; error: string }[] = [];

  for (const file of files) {
    try {
      const sourceCode = fs.readFileSync(file, 'utf-8');
      const { output, result } = runCodemodsOnFile(
        file,
        sourceCode,
        transforms,
      );

      if (result.modified) {
        fs.writeFileSync(file, output, 'utf-8');
        filesModified++;
        totalChanges.push(...result.changes.map((c) => `${file}: ${c}`));
      }

      manualReviewItems.push(...result.manualReviewItems);
    } catch (e) {
      errors.push({
        file,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { filesModified, totalChanges, manualReviewItems, errors };
}
