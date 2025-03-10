import { getPackageDotJson } from '../../utils/clack-utils';
import { findInstalledPackageFromList } from '../../utils/package-json';

export type SupportedTools =
  | 'webpack'
  | 'vite'
  | 'rollup'
  | 'esbuild'
  | 'tsc'
  | 'sentry-cli'
  | 'create-react-app'
  | 'angular'
  | 'nextjs'
  | 'remix'
  | 'no-tool';

// A map of package names pointing to the tool slug.
// The order is important, because we want to detect the most specific tool first.
// For instance, webpack needs to come before tsc because typescript c
// Similarly
export const TOOL_PACKAGE_MAP: Record<string, SupportedTools> = {
  '@angular/core': 'angular',
  'create-react-app': 'create-react-app',
  webpack: 'webpack',
  vite: 'vite',
  esbuild: 'esbuild',
  rollup: 'rollup',
  typescript: 'tsc',
};

export async function detectUsedTool(): Promise<SupportedTools> {
  const packageJson = await getPackageDotJson();

  const foundToolPackage = findInstalledPackageFromList(
    Object.keys(TOOL_PACKAGE_MAP),
    packageJson,
  );

  if (foundToolPackage) {
    return TOOL_PACKAGE_MAP[foundToolPackage.name];
  }

  return 'sentry-cli';
}
