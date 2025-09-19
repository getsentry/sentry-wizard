import { instrumentServerEntry } from './src/react-router/codemods/server-entry.js';
import fs from 'fs';
import path from 'path';

// Test what happens with the realistic basic fixture
const basicContent = fs.readFileSync(
  './test/react-router/codemods/fixtures/server-entry-basic.tsx',
  'utf8'
);

console.log('=== ORIGINAL BASIC FIXTURE ===');
console.log(basicContent);

const tmpFile = './tmp-test-entry.tsx';
fs.writeFileSync(tmpFile, basicContent);

try {
  await instrumentServerEntry(tmpFile);

  const result = fs.readFileSync(tmpFile, 'utf8');
  console.log('\n=== RESULT AFTER INSTRUMENTATION ===');
  console.log(result);
} catch (error) {
  console.error('Error:', error);
} finally {
  if (fs.existsSync(tmpFile)) {
    fs.unlinkSync(tmpFile);
  }
}
