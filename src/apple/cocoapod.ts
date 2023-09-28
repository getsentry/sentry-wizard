import * as fs from 'fs';
import * as path from 'path';
import * as bash from '../utils/bash';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

export function usesCocoaPod(projPath: string): boolean {
  return fs.existsSync(path.join(projPath, 'Podfile'));
}

export async function addCocoaPods(projPath: string): Promise<boolean> {
  const podfile = path.join(projPath, 'Podfile');

  const podContent = fs.readFileSync(podfile, 'utf8');

  if (
    /^\s*pod\s+(['"]Sentry['"]|['"]SentrySwiftUI['"])\s*$/im.test(podContent)
  ) {
    // Already have Sentry pod
    return true;
  }

  let podMatch = /^( *)pod\s+['"](\w+)['"] *$/im.exec(podContent);
  if (!podMatch) {
    // No Podfile is empty, will try to add Sentry pod after "use_frameworks!"
    const frameworkMatch = /^( *)use_frameworks![^\n]* *$/im.exec(podContent);
    if (!frameworkMatch) {
      return false;
    }
    podMatch = frameworkMatch;
  }

  const insertIndex = podMatch.index + podMatch[0].length;
  const newFileContent =
    podContent.slice(0, insertIndex) +
    '\n' +
    podMatch[1] +
    "pod 'Sentry'\n" +
    podContent.slice(insertIndex);
  fs.writeFileSync(podfile, newFileContent, 'utf8');

  clack.log.step('Sentry pod added to the project podFile.');

  await podInstall();

  return true;
}

export async function podInstall() {
  const loginSpinner = clack.spinner();
  loginSpinner.start("Running 'pod install'. This may take a few minutes...");

  try {
    await bash.execute('pod repo update');
    await bash.execute('pod install --silent');
    loginSpinner.stop('Running "pod install"');
  } catch (e) {
    loginSpinner.stop('Running "pod install"');
    clack.log.error(
      'Failed to run "pod install". You can run it manually for more details.',
    );
    Sentry.captureException('Sentry pod install failed.');
  }
}
