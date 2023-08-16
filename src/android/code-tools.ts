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

export function findActivitySourceFile(
  appDir: string,
  packageName: string,
  activityName: string,
): string | undefined {
  const javaSrcDir = path.join(appDir, 'src', 'main', 'java');
  let possibleActivityPath;
  const packageNameParts = packageName.split('.');
  const activityNameParts = activityName.split('.');

  if (fs.existsSync(javaSrcDir)) {
    possibleActivityPath = `${path.join(
      javaSrcDir,
      ...packageNameParts,
      ...activityNameParts,
    )}.java`;
    if (!fs.existsSync(possibleActivityPath)) {
      // try kotlin if no java file
      possibleActivityPath = possibleActivityPath.replace('.java', '.kt');
    }
  }

  if (!possibleActivityPath || !fs.existsSync(possibleActivityPath)) {
    const kotlinSrcDir = path.join(appDir, 'src', 'main', 'kotlin');
    if (fs.existsSync(kotlinSrcDir)) {
      possibleActivityPath = `${path.join(
        kotlinSrcDir,
        ...packageNameParts,
        ...activityNameParts,
      )}.kt`;
    }
  }
  return possibleActivityPath;
}

export function patchMainActivity(activityFile: string | undefined): boolean {
  if (!activityFile || !fs.existsSync(activityFile)) {
    clack.log.warn('No main activity source file found in filesystem.');
    Sentry.captureException('No main activity source file');
    return false;
  }

  const activityContent = fs.readFileSync(activityFile, 'utf8');

  if (/import io\.sentry\.Sentry;?/i.test(activityContent)) {
    // sentry is already configured
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold('Main Activity')} is already patched with test error snippet.`,
      ),
    );
    return true;
  }

  const importRegex = /import\s+[\w.]+;?/gim;
  let importsMatch = importRegex.exec(activityContent);
  let importIndex = 0;
  while (importsMatch) {
    importIndex = importsMatch.index + importsMatch[0].length + 1;
    importsMatch = importRegex.exec(activityContent);
  }
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
