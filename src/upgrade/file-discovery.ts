import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const FILE_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'];
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.d.ts',
];

export async function discoverFiles(projectDir: string): Promise<string[]> {
  const pattern = `**/*.{${FILE_EXTENSIONS.join(',')}}`;
  const files = await glob(pattern, {
    cwd: projectDir,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  // Filter to only files containing @sentry/ references
  const sentryFiles: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('@sentry/')) {
      sentryFiles.push(file);
    }
  }

  return sentryFiles;
}

export function readPackageJson(
  projectDir: string,
): Record<string, unknown> | null {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<
    string,
    unknown
  >;
}
