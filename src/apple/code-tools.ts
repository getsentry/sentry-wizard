import * as fs from 'fs';
import * as path from 'path';
import * as templates from './templates';
import * as Sentry from '@sentry/node';

const swiftAppLaunchRegex =
  /(func\s+application\s*\(_\sapplication:[^,]+,\s*didFinishLaunchingWithOptions[^,]+:[^)]+\)\s+->\s+Bool\s+{)|(init\s*\([^)]*\)\s*{)/im;
const objcAppLaunchRegex =
  /-\s*\(BOOL\)\s*application:\s*\(UIApplication\s*\*\)\s*application\s+didFinishLaunchingWithOptions:\s*\(NSDictionary\s*\*\)\s*launchOptions\s*{/im;
const swiftUIRegex = /struct[^:]+:\s*App\s*{/im;

function isAppDelegateFile(filePath: string): boolean {
  const appLaunchRegex = filePath.toLowerCase().endsWith('.swift')
    ? swiftAppLaunchRegex
    : objcAppLaunchRegex;

  const fileContent = fs.readFileSync(filePath, 'utf8');
  return appLaunchRegex.test(fileContent) || swiftUIRegex.test(fileContent);
}

function findAppDidFinishLaunchingWithOptions(dir: string): string | null {
  const files = fs.readdirSync(dir);
  //iterate over subdirectories later,
  //the appdelegate usually is in the top level
  const dirs: string[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    if (
      file.endsWith('.swift') ||
      file.endsWith('.m') ||
      file.endsWith('.mm')
    ) {
      if (isAppDelegateFile(filePath)) {
        return filePath;
      }
    } else if (
      !file.startsWith('.') &&
      !file.endsWith('.xcodeproj') &&
      !file.endsWith('.xcassets') &&
      fs.lstatSync(filePath).isDirectory()
    ) {
      dirs.push(file);
    }
  }

  for (const dr of dirs) {
    const result = findAppDidFinishLaunchingWithOptions(path.join(dir, dr));
    if (result) return result;
  }
  return null;
}

export function addCodeSnippetToProject(
  projPath: string,
  dsn: string,
): boolean {
  const appDelegate = findAppDidFinishLaunchingWithOptions(projPath);
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
  const newFileContent =
    (fileContent.indexOf(importStatement) >= 0 ? '' : importStatement) +
    fileContent.slice(0, insertIndex) +
    '\n' +
    codeSnippet +
    fileContent.slice(insertIndex);
  fs.writeFileSync(appDelegate, newFileContent, 'utf8');

  return true;
}
