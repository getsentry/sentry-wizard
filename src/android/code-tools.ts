import * as fs from 'fs';
import * as path from 'path';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import {
  sentryImport,
  sentryImportKt,
  testErrorSnippet,
  testErrorSnippetKt,
} from './templates';
import { findFile } from '../utils/ast-utils';

/**
 * Looks in src/main/java or src/main/kotlin for the specified {@link packageName} and
 * {@link activityName} by concatenating them. For example:
 *
 * src/
 *   main/
 *     java/ or kotlin/
 *       my.package.name/
 *         ui/
 *           MainActivity.kt
 *
 * src/main/java can contain both .java and .kt sources, whilst src/main/kotlin only .kt
 *
 * @param appDir
 * @param packageName
 * @param activityName
 * @returns path to the Main Activity
 */
export function findActivitySourceFile(
  appDir: string,
  packageName: string,
  activityName: string,
): string | undefined {
  const javaSrcDir = path.join(appDir, 'src', 'main', 'java');
  let possibleActivityPath;
  // if activity name starts with a dot, this means we need to concat packagename with it, otherwise
  // the package name is already specified in the activity name itself
  const packageNameParts = activityName.startsWith('.')
    ? packageName.split('.')
    : [];
  const activityNameParts = activityName.split('.');

  if (fs.existsSync(javaSrcDir)) {
    possibleActivityPath = findFile(
      path.join(javaSrcDir, ...packageNameParts, ...activityNameParts),
      ['.kt', '.java'],
    );
  }

  if (!possibleActivityPath || !fs.existsSync(possibleActivityPath)) {
    const kotlinSrcDir = path.join(appDir, 'src', 'main', 'kotlin');
    if (fs.existsSync(kotlinSrcDir)) {
      possibleActivityPath = findFile(
        path.join(kotlinSrcDir, ...packageNameParts, ...activityNameParts),
        ['.kt'],
      );
    }
  }
  return possibleActivityPath;
}

/**
 * Patches Main Activity with the test error code snippet by the specified path {@link activityFile}.
 * Finds activity's `onCreate` method, adds the snippet and necessary imports.
 *
 * ```kotlin
 * import something
 * import something.something
 * import io.sentry.Sentry <-- this is added by us
 *
 * override fun onCreate(savedInstanceState: Bundle?) {
 *   super.onCreate(savedInstanceState)
 *   // the snippet goes here <--
 *   doSomething()
 * }
 * ```
 *
 * @param activityFile
 * @returns true if successfully patched, false otherwise
 */
export function patchMainActivity(activityFile: string | undefined): boolean {
  if (!activityFile || !fs.existsSync(activityFile)) {
    clack.log.warn('No main activity source file found in filesystem.');
    Sentry.captureException('No main activity source file');
    return false;
  }

  const activityContent = fs.readFileSync(activityFile, 'utf8');

  if (/import\s+io\.sentry\.Sentry;?/i.test(activityContent)) {
    // sentry is already configured
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'Main Activity',
        )} is already patched with test error snippet.`,
      ),
    );
    return true;
  }

  const importIndex = getLastImportLineLocation(activityContent);

  let newActivityContent;
  if (activityFile.endsWith('.kt')) {
    newActivityContent =
      activityContent.slice(0, importIndex) +
      sentryImportKt +
      activityContent.slice(importIndex);
  } else {
    newActivityContent =
      activityContent.slice(0, importIndex) +
      sentryImport +
      activityContent.slice(importIndex);
  }

  const onCreateMatch = /super\.onCreate\(.*?\);?/i.exec(newActivityContent);
  if (!onCreateMatch) {
    clack.log.warn('No onCreate method found in main activity.');
    Sentry.captureException('No onCreate method');
    return false;
  }

  const onCreateIndex = onCreateMatch.index + onCreateMatch[0].length;
  if (activityFile.endsWith('.kt')) {
    newActivityContent =
      newActivityContent.slice(0, onCreateIndex) +
      testErrorSnippetKt +
      newActivityContent.slice(onCreateIndex);
  } else {
    newActivityContent =
      newActivityContent.slice(0, onCreateIndex) +
      testErrorSnippet +
      newActivityContent.slice(onCreateIndex);
  }
  fs.writeFileSync(activityFile, newActivityContent, 'utf8');

  clack.log.success(
    chalk.greenBright(
      `Patched ${chalk.bold(
        'Main Activity',
      )} with the Sentry test error snippet.`,
    ),
  );

  return true;
}

/**
 * Returns the string index of the last import statement in the given code file.
 * Works for both Java and Kotlin import statements.
 *
 * @param sourceCode
 * @returns the insert index, or 0 if none found.
 */
export function getLastImportLineLocation(sourceCode: string): number {
  const importRegex = /import(?:\sstatic)?\s+[\w.*]+(?: as [\w.]+)?;?/gim;

  let importsMatch = importRegex.exec(sourceCode);
  let importIndex = 0;
  while (importsMatch) {
    importIndex = importsMatch.index + importsMatch[0].length + 1;
    importsMatch = importRegex.exec(sourceCode);
  }
  return importIndex;
}
