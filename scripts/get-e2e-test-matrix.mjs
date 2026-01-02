import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dirname = new URL('.', import.meta.url).pathname;
const tests = readdirSync(join(dirname, '../e2e-tests/tests'));

const matrixValues = tests
  .filter((test) => test.endsWith('.test.ts'))
  .map((test) => test.replace('.test.ts', ''));

console.log(JSON.stringify(matrixValues));
