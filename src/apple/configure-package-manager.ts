// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';

import { traceStep } from '../telemetry';
import { askForItemSelection } from '../utils/clack';
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
    // If the user has CocoaPods installed, we need to ask them which package manager they want to use.
    // Otherwise, we can just use the Swift Package Manager.
    debug('Asking user to choose a package manager');
    const pm = (
      await traceStep('Choose a package manager', () =>
        askForItemSelection(
          ['Swift Package Manager', 'CocoaPods'],
          'Which package manager would you like to use to add Sentry?',
        ),
      )
    ).value;
    debug(`User chose package manager: ${chalk.cyan(pm)}`);

    shouldUseSPM = pm === 'Swift Package Manager';

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
  Sentry.setTag('package-manager', shouldUseSPM ? 'SPM' : 'cocoapods');

  return { shouldUseSPM };
}
