import * as fs from 'fs';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  confirmContinueIfNoOrDirtyGitRepo,
  printWelcome,
} from '../utils/clack-utils';
import {
  findBundlePhase,
  getValidExistingBuildPhases,
  unPatchBundlePhase,
  unPatchDebugFilesUploadPhase,
  writeXcodeProject,
} from './xcode';
import { APP_BUILD_GRADLE, XCODE_PROJECT, getFirstMatchedPath } from './glob';
import {
  doesAppBuildGradleIncludeRNSentryGradlePlugin,
  removeRNSentryGradlePlugin,
  writeAppBuildGradle,
} from './gradle';
import { ReactNativeWizardOptions } from './options';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const xcode = require('xcode');

export async function runReactNativeUninstall(
  options: ReactNativeWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry React Native Uninstall Wizard',
    message: 'This wizard will remove Sentry from your React Native project.',
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  unPatchXcodeFiles();

  unPatchAndroidFiles();

  clack.note(
    `To make sure your project builds after removing Sentry please run:

1. ${chalk.bold('yarn remove @sentry/react-native')}
2. ${chalk.bold('cd ios && pod install')}
3. Remove all occurrences of ${chalk.bold(
      '@sentry/react-native',
    )} from your application code.`,
  );

  clack.outro(
    `${chalk.green('Uninstall is done!')}

   ${chalk.dim(
     'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-react-native/issues',
   )}`,
  );
}

function unPatchXcodeFiles() {
  const xcodeProjectPath = getFirstMatchedPath(XCODE_PROJECT);
  if (!xcodeProjectPath) {
    clack.log.warn(
      `Could not find Xcode project file using ${chalk.bold(XCODE_PROJECT)}.`,
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const xcodeProject = xcode.project(xcodeProjectPath);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  xcodeProject.parseSync();
  const buildPhases = getValidExistingBuildPhases(xcodeProject);

  const bundlePhase = findBundlePhase(buildPhases);
  unPatchBundlePhase(bundlePhase);

  unPatchDebugFilesUploadPhase(xcodeProject);

  writeXcodeProject(xcodeProjectPath, xcodeProject);
}

function unPatchAndroidFiles() {
  const appBuildGradlePath = getFirstMatchedPath(APP_BUILD_GRADLE);
  if (!appBuildGradlePath) {
    clack.log.warn(
      `Could not find Android app/build.gradle file using ${chalk.bold(
        APP_BUILD_GRADLE,
      )}.`,
    );
    return;
  }

  const appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf-8');
  const includesSentry =
    doesAppBuildGradleIncludeRNSentryGradlePlugin(appBuildGradle);
  if (!includesSentry) {
    clack.log.warn(`Sentry not found in Android app/build.gradle.`);
    return;
  }

  const patchedAppBuildGradle = removeRNSentryGradlePlugin(appBuildGradle);

  writeAppBuildGradle(appBuildGradlePath, patchedAppBuildGradle);
}
