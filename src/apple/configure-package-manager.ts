// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';

import { traceStep } from '../telemetry';
import { abortIfCancelled } from '../utils/clack';
import { debug } from '../utils/debug';
import * as cocoapod from './cocoapod';

export async function configurePackageManager({
  projectDir,
}: {
  projectDir: string;
}) {
  debug(
    `Checking if CocoaPods is installed at path: ${chalk.cyan(projectDir)}`,
  );

  // Xcode ships with the Swift Package Manager and potentially using CocoaPods.
  // We need to check if the user has CocoaPods set up.
  let shouldUseSPM = true;

  const isCocoaPodsAvailable = cocoapod.usesCocoaPod(projectDir);
  Sentry.setTag('cocoapod-exists', isCocoaPodsAvailable);
  debug(`CocoaPods is ${isCocoaPodsAvailable ? 'installed' : 'not installed'}`);

  if (isCocoaPodsAvailable) {
    clack.log.warn(
      'CocoaPods is being deprecated. No new updates will be released after June 2026.\nWe recommend migrating to Swift Package Manager (SPM).',
    );

    debug('Asking user to choose a package manager');
    const pm: 'SPM' | 'CocoaPods' = await traceStep(
      'Choose a package manager',
      () =>
        abortIfCancelled(
          clack.select({
            message:
              'Which package manager would you like to use to add Sentry?',
            options: [
              {
                value: 'SPM',
                label: 'Swift Package Manager',
                hint: 'Recommended',
              },
              {
                value: 'CocoaPods',
                label: 'CocoaPods',
                hint: 'Deprecated - no updates after June 2026',
              },
            ],
          }),
        ),
    );
    debug(`User chose package manager: ${chalk.cyan(pm)}`);

    shouldUseSPM = pm === 'SPM';

    if (!shouldUseSPM) {
      debug('Adding CocoaPods reference');
      const podAdded = await traceStep('Add CocoaPods reference', () =>
        cocoapod.addCocoaPods(projectDir),
      );
      Sentry.setTag('cocoapod-added', podAdded);
      debug(`CocoaPods reference added: ${chalk.cyan(podAdded.toString())}`);

      if (!podAdded) {
        clack.log.warn(
          "Could not add Sentry pod to your Podfile. You'll have to add it manually.\nPlease follow the instructions at https://docs.sentry.io/platforms/apple/guides/ios/#install",
        );
      }
    }
  }
  debug(`Should use SPM: ${chalk.cyan(shouldUseSPM.toString())}`);
  Sentry.setTag('package-manager', shouldUseSPM ? 'SPM' : 'CocoaPods');

  return { shouldUseSPM };
}
