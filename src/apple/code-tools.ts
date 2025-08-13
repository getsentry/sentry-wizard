import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as path from 'path';
import * as templates from './templates';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { debug } from '../utils/debug';

const swiftAppLaunchRegex =
  /(func\s+application\s*\(\s*_\s+application:\s*[^,]+,\s*didFinishLaunchingWithOptions[^,]+:\s*[^)]+\s*\)\s+->\s+Bool\s+{)|func\s+applicationDidFinishLaunching\s*\(\s*_\s+aNotification:\s+Notification\s*\)\s*{/im;
const objcAppLaunchRegex =
  /-\s*\(\s*BOOL\s*\)\s*application:\s*\(\s*UIApplication\s*\*\s*\)\s*application\s+didFinishLaunchingWithOptions:\s*\(\s*NSDictionary\s*\*\s*\)\s*launchOptions\s*{/im;
const swiftUIRegex = /@main\s+struct[^:]+:\s*(SwiftUI\.)?App\s*{/im;

function isAppDelegateFile(filePath: string): boolean {
  debug('Checking if ' + filePath + ' is an AppDelegate file');
  const appLaunchRegex = filePath.toLowerCase().endsWith('.swift')
    ? swiftAppLaunchRegex
    : objcAppLaunchRegex;

  const fileContent = fs.readFileSync(filePath, 'utf8');
  return appLaunchRegex.test(fileContent) || swiftUIRegex.test(fileContent);
}

function findAppDidFinishLaunchingWithOptionsInDirectory(
  dir: string,
): string | null {
  debug('Searching for AppDelegate in directory: ' + dir);
  const files = fs.readdirSync(dir);
  const filePaths = files.map((f) => path.join(dir, f));
  return findAppDidFinishLaunchingWithOptions(filePaths);
}

function findAppDidFinishLaunchingWithOptions(files: string[]): string | null {
  debug(`Searching for AppDelegate in ${files.length} files`);

  // Iterate over subdirectories after iterating over files,
  // because the AppDelegate is usually in the top level
  const dirs: string[] = [];
  for (const filePath of files) {
    debug('Checking file: ' + filePath);
    if (
      filePath.endsWith('.swift') ||
      filePath.endsWith('.m') ||
      filePath.endsWith('.mm')
    ) {
      if (fs.existsSync(filePath) && isAppDelegateFile(filePath)) {
        debug('Found AppDelegate in ' + filePath);
        return filePath;
      }
    } else if (
      !path.basename(filePath).startsWith('.') &&
      !filePath.endsWith('.xcodeproj') &&
      !filePath.endsWith('.xcassets') &&
      fs.existsSync(filePath) &&
      fs.lstatSync(filePath).isDirectory()
    ) {
      dirs.push(filePath);
    }
  }

  for (const dr of dirs) {
    const result = findAppDidFinishLaunchingWithOptionsInDirectory(dr);
    if (result) {
      debug('Found AppDelegate in ' + dr);
      return result;
    }
  }
  return null;
}

export function addCodeSnippetToProject(
  files: string[],
  dsn: string,
  enableLogs: boolean,
): boolean {
  const appDelegate = findAppDidFinishLaunchingWithOptions(files);
  if (!appDelegate) {
    return false;
  }

  const fileContent = fs.readFileSync(appDelegate, 'utf8');
  const isSwift = appDelegate.toLowerCase().endsWith('.swift');
  const appLaunchRegex = isSwift ? swiftAppLaunchRegex : objcAppLaunchRegex;
  const importStatement = isSwift ? 'import Sentry\n' : '@import Sentry;\n';
  const checkForSentryInit = isSwift ? 'SentrySDK.start' : '[SentrySDK start';
  let codeSnippet = isSwift
    ? templates.getSwiftSnippet(dsn, enableLogs)
    : templates.getObjcSnippet(dsn, enableLogs);

  Sentry.setTag('code-language', isSwift ? 'swift' : 'objc');
  Sentry.setTag(
    'ui-engine',
    swiftUIRegex.test(fileContent) ? 'swiftui' : 'uikit',
  );

  if (fileContent.includes(checkForSentryInit)) {
    //already initialized
    clack.log.info(
      'Sentry is already initialized in your AppDelegate. Skipping adding the code snippet.',
    );
    return true;
  }

  let match = appLaunchRegex.exec(fileContent);
  if (!match) {
    const swiftUIMatch = swiftUIRegex.exec(fileContent);
    if (!swiftUIMatch) {
      // This branch is not reached, because we already checked for SwiftUI in isAppDelegateFile
      return false;
    }
    //Is SwiftUI with no init
    match = swiftUIMatch;
    codeSnippet = `    init() {\n${codeSnippet}    }`;
  }

  const insertIndex = match.index + match[0].length;
  let newFileContent =
    fileContent.slice(0, insertIndex) +
    '\n' +
    codeSnippet +
    fileContent.slice(insertIndex);

  if (newFileContent.indexOf(importStatement) < 0) {
    const firstImport = /^[ \t]*import +\w+.*$/m.exec(newFileContent);
    if (firstImport) {
      const importIndex = firstImport.index + firstImport[0].length;
      newFileContent =
        newFileContent.slice(0, importIndex) +
        '\n' +
        importStatement +
        newFileContent.slice(importIndex);
    } else {
      newFileContent = importStatement + newFileContent;
    }
  }

  fs.writeFileSync(appDelegate, newFileContent, 'utf8');

  clack.log.step('Added Sentry initialization code snippet to ' + appDelegate);
  return true;
}

/**
 * Exported for testing purposes, but should not be used in other modules.
 */
export let exportForTesting: {
  isAppDelegateFile: typeof isAppDelegateFile;
  findAppDidFinishLaunchingWithOptionsInDirectory: typeof findAppDidFinishLaunchingWithOptionsInDirectory;
  findAppDidFinishLaunchingWithOptions: typeof findAppDidFinishLaunchingWithOptions;
};
if (process.env.NODE_ENV === 'test') {
  exportForTesting = {
    isAppDelegateFile,
    findAppDidFinishLaunchingWithOptionsInDirectory,
    findAppDidFinishLaunchingWithOptions,
  };
}
