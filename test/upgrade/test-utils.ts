import { expect } from 'vitest';
import * as recast from 'recast';
import type {
  CodemodTransform,
  CodemodResult,
} from '../../src/upgrade/types.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const babelTsParser = require('recast/parsers/babel-ts');

export function parseCode(input: string): recast.types.namedTypes.Program {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return recast.parse(input, { parser: babelTsParser })
    .program as recast.types.namedTypes.Program;
}

export function printProgram(program: recast.types.namedTypes.Program): string {
  const file = recast.types.builders.file(program);
  return recast.print(file).code;
}

export function assertTransform(
  transform: CodemodTransform,
  input: string,
  expected: string,
): void {
  const program = parseCode(input);
  const result = transform.transform({
    program,
    filePath: 'test.ts',
    sourceCode: input,
  });
  expect(result.modified).toBe(true);
  const output = printProgram(program);
  expect(output.trim()).toBe(expected.trim());
}

export function assertNoChange(
  transform: CodemodTransform,
  input: string,
): void {
  const program = parseCode(input);
  const result = transform.transform({
    program,
    filePath: 'test.ts',
    sourceCode: input,
  });
  expect(result.modified).toBe(false);
}

export function runTransform(
  transform: CodemodTransform,
  input: string,
): CodemodResult {
  const program = parseCode(input);
  return transform.transform({
    program,
    filePath: 'test.ts',
    sourceCode: input,
  });
}
