import * as fs from 'fs';
import * as path from 'path';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import {
  sentryImport,
  pubspecOptions,
  sentryProperties,
  initSnippet,
} from './templates';
import { fetchSdkVersion } from '../utils/release-registry';
import { featureSelectionPrompt }  from '../utils/clack-utils';

/**
 * Recursively finds a file per name in subfolders.
 * @param dir - The directory to start searching.
 * @param name - The name of the file including path extension.
 * @returns The path to the main.dart file or null if not found.
 */
export function findFile(dir: string, name: string): string | null {
  const files: string[] = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath: string = path.join(dir, file);
    const stats: fs.Stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      const result: string | null = findFile(fullPath, name);
      if (result) {
        return result;
      }
    } else if (file === name) {
      return fullPath;
    }
  }

  return null;
}

export async function patchPubspec(pubspecFile: string | null, project: string, org: string): Promise<boolean> {
  if (!pubspecFile || !fs.existsSync(pubspecFile)) {
    clack.log.warn('No pubspec.yaml source file found in filesystem.');
    Sentry.captureException('No pubspec.yaml source file');
    return false;
  }
  let pubspecContent = fs.readFileSync(pubspecFile, 'utf8');

  if (!pubspecContent.includes('sentry_flutter:')) {
    const dependenciesIndex = getDependenciesLocation(pubspecContent);

    const sentryDartFlutterVersion = await fetchSdkVersion("sentry.dart.flutter") ?? "any";
    pubspecContent = pubspecContent.slice(0, dependenciesIndex) +
      `  sentry_flutter: ${sentryDartFlutterVersion ? `^${sentryDartFlutterVersion}` : "any"}\n` +
      pubspecContent.slice(dependenciesIndex);
    
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'sentry_flutter',
        )} added to pubspec.yaml`,
      ),
    );
  } else {
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'sentry_flutter',
        )} is already included in pubspec.yaml`,
      ),
    );
  }
  
  if (!pubspecContent.includes('sentry_dart_plugin:')) {
    const devDependenciesIndex = getDevDependenciesLocation(pubspecContent);
    
    const sentryDartPluginVersion = await fetchSdkVersion("sentry.dart.plugin") ?? "any";
    pubspecContent = pubspecContent.slice(0, devDependenciesIndex) +
      `  sentry_dart_plugin: ${sentryDartPluginVersion ? `^${sentryDartPluginVersion}` : "any"}\n` +
      pubspecContent.slice(devDependenciesIndex);

    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'sentry_dart_plugin',
        )} added to pubspec.yaml`,
      ),
    );
  } else {
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'sentry_dart_plugin',
        )} is already included in pubspec.yaml`,
      ),
    );
  }
  
  if (!pubspecContent.includes('sentry:')) {
    pubspecContent += '\n'
    pubspecContent += pubspecOptions(project, org);

    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'sentry plugin configuration',
        )} added to pubspec.yaml`,
      ),
    );
  } else {
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'sentry plugin configuration',
        )} is already included in pubspec.yaml`,
      ),
    );
  }
  
  fs.writeFileSync(pubspecFile, pubspecContent, 'utf8');

  return true;
}

export function addProperties(pubspecFile: string | null, authToken: string) {
  if (!pubspecFile || !fs.existsSync(pubspecFile)) {
    clack.log.warn('No pubspec.yaml source file found in filesystem.');
    Sentry.captureException('No pubspec.yaml source file');
    return false;
  }

  try {
    const pubspecDir = path.dirname(pubspecFile);
    const sentryPropertiesFileName = 'sentry.properties';
    const sentryPropertiesFile = path.join(pubspecDir, sentryPropertiesFileName);
    const sentryPropertiesContent = sentryProperties(authToken);

    fs.writeFileSync(sentryPropertiesFile, sentryPropertiesContent, 'utf8');

    const gitignoreFile = path.join(pubspecDir, '.gitignore');
    if (fs.existsSync(gitignoreFile)) {
      fs.appendFileSync(gitignoreFile, `\n${sentryPropertiesFileName}\n`);
    } else {
      fs.writeFileSync(gitignoreFile, `${sentryPropertiesFileName}\n`, 'utf8');
    }
    return true;
  } catch (e) {
    return false;
  }
}

export async function patchMain(mainFile: string | null, dsn: string): Promise<boolean> {
  if (!mainFile || !fs.existsSync(mainFile)) {
    clack.log.warn('No main.dart source file found in filesystem.');
    Sentry.captureException('No main.dart source file');
    return false;
  }

  let mainContent = fs.readFileSync(mainFile, 'utf8');

  if (/import\s+['"]package[:]sentry_flutter\/sentry_flutter\.dart['"];?/i.test(mainContent)) {
    // sentry is already configured
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'main.dart',
        )} is already patched with test error snippet.`,
      ),
    );
    return true;
  }
  
  mainContent = await patchMainContent(dsn, mainContent);

  fs.writeFileSync(mainFile, mainContent, 'utf8');

  clack.log.success(
    chalk.greenBright(
      `Patched ${chalk.bold(
        'main.dart',
      )} with the Sentry setup and test error snippet.`,
    ),
  );

  return true;
}

export async function patchMainContent(dsn: string, mainContent: string): Promise<string> {
  
  const importIndex = getLastImportLineLocation(mainContent);
  mainContent = mainContent.slice(0, importIndex) +
    sentryImport +
    mainContent.slice(importIndex);

  const selectedFeatures = await featureSelectionPrompt([
    {
      id: 'tracing',
      prompt: `Do you want to enable ${chalk.bold(
        'Tracing',
      )} to track the performance of your application?`,
      enabledHint: 'recommended',
    },
    {
      id: 'profiling',
      prompt: `Do you want to enable ${chalk.bold(
        'Profiling',
      )} to analyze CPU usage and optimize performance-critical code?`,
      enabledHint: 'recommended, tracing must be enabled',
    },
  ] as const);

  // Find and replace `runApp(...)`
  mainContent = mainContent.replace(
    /runApp\(([\s\S]*?)\);/g, // Match the `runApp(...)` invocation
    (_, runAppArgs) => initSnippet(
      dsn,
      selectedFeatures,
      runAppArgs as string
    )
  );

  // Make the `main` function async if it's not already
  mainContent = mainContent.replace(
    /void\s+main\(\)\s*\{/g,
    'Future<void> main() async {'
  );

  return mainContent;
}

export function getLastImportLineLocation(sourceCode: string): number {
  const importRegex = /import\s+['"].*['"].*;/gim;
  return getLastReqExpLocation(sourceCode, importRegex);
}

export function getDependenciesLocation(sourceCode: string): number {
  const dependencyRegex = /^dependencies:\s*$/gim;
  return getLastReqExpLocation(sourceCode, dependencyRegex);
}

export function getDevDependenciesLocation(sourceCode: string): number {
  const dependencyRegex = /^dev_dependencies:\s*$/gim;
  return getLastReqExpLocation(sourceCode, dependencyRegex);
}

// Helper

function getLastReqExpLocation(sourceCode: string, regExp: RegExp): number {
  let match = regExp.exec(sourceCode);
  let importIndex = 0;
  while (match) {
    importIndex = match.index + match[0].length + 1;
    match = regExp.exec(sourceCode);
  }
  return importIndex;
}
