// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

import { traceStep } from '../telemetry';
import { abort, askForItemSelection } from '../utils/clack';
import { debug } from '../utils/debug';
import { searchXcodeProjectAtPath } from './search-xcode-project-at-path';
import { XcodeProject } from './xcode-manager';

export async function lookupXcodeProject({
  projectDir,
}: {
  projectDir: string;
}): Promise<{
  xcProject: XcodeProject;
  target: string;
}> {
  debug(`Looking for Xcode project in directory: ${chalk.cyan(projectDir)}`);
  const xcodeProjFiles = searchXcodeProjectAtPath(projectDir);
  if (xcodeProjFiles.length === 0) {
    clack.log.error(
      'No Xcode project found. Please run this command from the root of your project.',
    );
    Sentry.setTag('no-xcode-project', true);
    return await abort();
  }
  debug(
    `Found ${chalk.cyan(
      xcodeProjFiles.length.toString(),
    )} candidates for Xcode project`,
  );

  // In case there is only one Xcode project, we can use that one.
  // Otherwise, we need to ask the user which one they want to use.
  let xcodeProjFile: string;
  if (xcodeProjFiles.length === 1) {
    debug(`Found exactly one Xcode project, using it`);
    Sentry.setTag('multiple-projects', false);
    xcodeProjFile = xcodeProjFiles[0];
  } else {
    debug(`Found multiple Xcode projects, asking user to choose one`);
    Sentry.setTag('multiple-projects', true);
    xcodeProjFile = (
      await traceStep('Choose Xcode project', () =>
        askForItemSelection(
          xcodeProjFiles,
          'Which project do you want to add Sentry to?',
        ),
      )
    ).value;
  }

  // Load the pbxproj file
  const pathToPbxproj = path.join(projectDir, xcodeProjFile, 'project.pbxproj');
  debug(`Loading Xcode project pbxproj at path: ${chalk.cyan(pathToPbxproj)}`);
  if (!fs.existsSync(pathToPbxproj)) {
    clack.log.error(`No pbxproj found at ${xcodeProjFile}`);
    Sentry.setTag('pbxproj-not-found', true);
    return await abort();
  }

  const xcProject = new XcodeProject(pathToPbxproj);
  const availableTargets = xcProject.getAllTargets();
  if (availableTargets.length == 0) {
    clack.log.error(`No suitable Xcode target found in ${xcodeProjFile}`);
    Sentry.setTag('No-Target', true);
    return await abort();
  }
  debug(
    `Found ${chalk.cyan(
      availableTargets.length.toString(),
    )} targets in Xcode project`,
  );

  // Step - Lookup Xcode Target
  let target: string;
  if (availableTargets.length == 1) {
    debug(`Found exactly one target, using it`);
    Sentry.setTag('multiple-targets', false);
    target = availableTargets[0];
  } else {
    debug(`Found multiple targets, asking user to choose one`);
    Sentry.setTag('multiple-targets', true);
    target = (
      await traceStep('Choose target', () =>
        askForItemSelection(
          availableTargets,
          'Which target do you want to add Sentry to?',
        ),
      )
    ).value;
  }
  debug(`Selected target: ${chalk.cyan(target)}`);

  return {
    xcProject,
    target,
  };
}
