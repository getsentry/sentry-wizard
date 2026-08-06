import * as fs from 'fs';
import * as path from 'path';
import * as bash from '../utils/bash';
import * as Sentry from '@sentry/node';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';

export function usesCocoaPod(projPath: string): boolean {
  return fs.existsSync(path.join(projPath, 'Podfile'));
}

/**
 * Ensures `use_modular_headers!` is present in the Podfile.
 *
 * As of `@sentry/react-native` 8.19.0 the `RNSentry` pod ships Swift code (the
 * `RNSentryInternal` bridge over `SentrySDK.internal`, part of the migration to
 * the prebuilt `Sentry.xcframework`). CocoaPods refuses to integrate a Swift pod
 * that depends on a non-modular Objective-C pod (e.g. `React-hermes` on React
 * Native versions that don't modularize it by default) unless the Podfile opts
 * into module maps. Without it, `pod install` fails with:
 *
 *   [!] The following Swift pods cannot yet be integrated as static libraries:
 *   The Swift pod `RNSentry` depends upon `React-hermes`, which does not define
 *   modules. [...] you may set `use_modular_headers!` globally in your Podfile
 *
 * The SDK's own docs instruct users to add this line manually; we do it for them.
 *
 * @returns `true` if the Podfile already had (or now has) `use_modular_headers!`,
 *   `false` if there is no Podfile to patch.
 */
export function addModularHeaders(projPath: string): boolean {
  const podfile = path.join(projPath, 'Podfile');

  if (!fs.existsSync(podfile)) {
    return false;
  }

  const podContent = fs.readFileSync(podfile, 'utf8');

  if (/^\s*use_modular_headers!/m.test(podContent)) {
    // Already opted into modular headers, nothing to do.
    return true;
  }

  // Insert above the first `target '...' do` block, matching the placement the
  // SDK docs recommend. The `^\s*` anchor avoids matching commented-out targets.
  const targetMatch = /^([ \t]*)target\s+['"][^'"]+['"]\s+do/m.exec(podContent);

  let newFileContent: string;
  if (targetMatch) {
    const insertIndex = targetMatch.index;
    newFileContent =
      podContent.slice(0, insertIndex) +
      'use_modular_headers!\n\n' +
      podContent.slice(insertIndex);
  } else {
    // No target block found, append to the end as a safe fallback.
    const separator =
      podContent.endsWith('\n') || podContent.length === 0 ? '' : '\n';
    newFileContent = `${podContent}${separator}use_modular_headers!\n`;
  }

  fs.writeFileSync(podfile, newFileContent, 'utf8');

  clack.log.step(
    `Added ${chalk.cyan('use_modular_headers!')} to the iOS ${chalk.cyan(
      'Podfile',
    )} (required by the Sentry React Native SDK).`,
  );

  return true;
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
    Sentry.setTag('pods-installed', true);
  } catch (e) {
    installSpinner.stop('Failed to install pods.');
    Sentry.setTag('pods-installed', false);
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
