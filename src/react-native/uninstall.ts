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
  doesAppBuildGradleIncludeSentry,
  unPatchAppBuildGradle,
  writeAppBuildGradle,
} from './gradle';
import { ReactNativeWizardOptions } from './options';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const xcode = require('xcode');

export async function runReactNativeUninstall(
  options: ReactNativeWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry React-Native Uninstall Wizard',
    message: 'This wizard will remove Sentry from your React Native project.',
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  unPatchXcodeFiles();

  unPatchAndroidFiles();
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
  const includesSentry = doesAppBuildGradleIncludeSentry(appBuildGradle);
  if (!includesSentry) {
    clack.log.warn(`Sentry not found in Android app/build.gradle.`);
    return;
  }

  const patchedAppBuildGradle = unPatchAppBuildGradle(appBuildGradle);

  writeAppBuildGradle(appBuildGradlePath, patchedAppBuildGradle);
}
