import * as fs from 'fs';
import * as path from 'path';
import * as templates from './templates';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

const swiftAppLaunchRegex =
  /(func\s+application\s*\(_\sapplication:[^,]+,\s*didFinishLaunchingWithOptions[^,]+:[^)]+\)\s+->\s+Bool\s+{)|func\s+applicationDidFinishLaunching\(_\s+aNotification:\s+Notification\)\s+{/im;
const objcAppLaunchRegex =
  /-\s*\(BOOL\)\s*application:\s*\(UIApplication\s*\*\)\s*application\s+didFinishLaunchingWithOptions:\s*\(NSDictionary\s*\*\)\s*launchOptions\s*{/im;
const swiftUIRegex = /@main\s+struct[^:]+:\s*App\s*{/im;

function isAppDelegateFile(filePath: string): boolean {
  const appLaunchRegex = filePath.toLowerCase().endsWith('.swift')
    ? swiftAppLaunchRegex
    : objcAppLaunchRegex;

  const fileContent = fs.readFileSync(filePath, 'utf8');
  return appLaunchRegex.test(fileContent) || swiftUIRegex.test(fileContent);
}

function findAppDidFinishLaunchingWithOptions(
  dir: string,
  files: string[] | undefined = undefined,
): string | null {
  if (!files) {
    files = fs.readdirSync(dir);
    files = files.map((f) => path.join(dir, f));
  }

  //iterate over subdirectories later,
  //the appdelegate usually is in the top level
  const dirs: string[] = [];

  for (const filePath of files) {
    if (
      filePath.endsWith('.swift') ||
      filePath.endsWith('.m') ||
      filePath.endsWith('.mm')
    ) {
      if (fs.existsSync(filePath) && isAppDelegateFile(filePath)) {
        return filePath;
      }
    } else if (
      !filePath.startsWith('.') &&
      !filePath.endsWith('.xcodeproj') &&
      !filePath.endsWith('.xcassets') &&
      fs.existsSync(filePath) &&
      fs.lstatSync(filePath).isDirectory()
    ) {
      dirs.push(filePath);
    }
  }

  for (const dr of dirs) {
    const result = findAppDidFinishLaunchingWithOptions(dr);
    if (result) return result;
  }
  return null;
}

export function addCodeSnippetToProject(
  projPath: string,
  files: string[],
  dsn: string,
): boolean {
  const appDelegate = findAppDidFinishLaunchingWithOptions(projPath, files);
  if (!appDelegate) {
    return false;
  }

  const fileContent = fs.readFileSync(appDelegate, 'utf8');
  const isSwift = appDelegate.toLowerCase().endsWith('.swift');
  const appLaunchRegex = isSwift ? swiftAppLaunchRegex : objcAppLaunchRegex;
  const importStatement = isSwift ? 'import Sentry\n' : '@import Sentry;\n';
  const checkForSentryInit = isSwift ? 'SentrySDK.start' : '[SentrySDK start';
  let codeSnippet = isSwift
    ? templates.getSwiftSnippet(dsn)
    : templates.getObjcSnippet(dsn);

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
