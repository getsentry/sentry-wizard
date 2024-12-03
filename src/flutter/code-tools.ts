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
  // testErrorSnippet,
} from './templates';

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

export function patchPubspec(pubspecFile: string | null, project: string, org: string): boolean {
  if (!pubspecFile || !fs.existsSync(pubspecFile)) {
    clack.log.warn('No pubspec.yaml source file found in filesystem.');
    Sentry.captureException('No pubspec.yaml source file');
    return false;
  }
  let pubspecContent = fs.readFileSync(pubspecFile, 'utf8');

  const dependenciesIndex = getDependenciesLocation(pubspecContent);

  // TODO: Check if already added sentry:

  pubspecContent = pubspecContent.slice(0, dependenciesIndex) +
    '  sentry:\n' +
    pubspecContent.slice(dependenciesIndex);

  const devDependenciesIndex = getDevDependenciesLocation(pubspecContent);

  // TODO: Check if already added sentry-dart-plugin:

  pubspecContent = pubspecContent.slice(0, devDependenciesIndex) +
    '  sentry-dart-plugin:\n' +
    pubspecContent.slice(devDependenciesIndex);

  // TODO: Check if already added sentry:

  pubspecContent += '\n'
  pubspecContent += pubspecOptions(project, org);
  
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

export function patchMain(mainFile: string | null): boolean {
  if (!mainFile || !fs.existsSync(mainFile)) {
    clack.log.warn('No main.dart source file found in filesystem.');
    Sentry.captureException('No main.dart source file');
    return false;
  }

  const mainContent = fs.readFileSync(mainFile, 'utf8');

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

  const importIndex = getLastImportLineLocation(mainContent);
  const newActivityContent = mainContent.slice(0, importIndex) +
    sentryImport +
    mainContent.slice(importIndex);

  // TODO: @denis setup

  // TODO: @denis snippet

  fs.writeFileSync(mainFile, newActivityContent, 'utf8');

  clack.log.success(
    chalk.greenBright(
      `Patched ${chalk.bold(
        'main.dart',
      )} with the Sentry setup and test error snippet.`,
    ),
  );

  return true;
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