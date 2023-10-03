import * as fs from 'fs';
import * as path from 'path';
import * as bash from '../utils/bash';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';

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

export async function podInstall(dir = '.') {
  const installSpinner = clack.spinner();
  installSpinner.start("Running 'pod install'. This may take a few minutes...");

  try {
    await bash.execute(`cd ${dir} && pod repo update`);
    await bash.execute(`cd ${dir} && pod install --silent`);
    installSpinner.stop('Pods installed.');
  } catch (e) {
    installSpinner.stop('Failed to install pods.');
    clack.log.error(
      `${chalk.red(
        'Encountered the following error during pods installation:',
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      )}\n\n${e}\n\n${chalk.dim(
        'If you think this issue is caused by the Sentry wizard, let us know here:\nhttps://github.com/getsentry/sentry-wizard/issues',
      )}`,
    );
    Sentry.captureException('Sentry pod install failed.');
  }
}
