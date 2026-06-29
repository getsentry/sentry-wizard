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
  nonInteractive,
}: {
  projectDir: string;
  nonInteractive?: boolean;
}): Promise<XcodeProject> {
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

    if (nonInteractive) {
      clack.log.error(
        [
          'Multiple Xcode projects found in non-interactive mode.',
          `Available projects: ${xcodeProjFiles.join(', ')}.`,
          'Run from a directory with a single .xcodeproj or pass --xcode-project-dir with a narrower project directory.',
        ].join(' '),
      );
      return await abort();
    }

    xcodeProjFile = (
      await traceStep('Choose Xcode project', () =>
        askForItemSelection(
          xcodeProjFiles,
          'Which project do you want to add Sentry to?',
        ),
      )
    ).value;
  }

  const pathToPbxproj = path.join(projectDir, xcodeProjFile, 'project.pbxproj');
  debug(`Loading Xcode project pbxproj at path: ${chalk.cyan(pathToPbxproj)}`);
  if (!fs.existsSync(pathToPbxproj)) {
    clack.log.error(`No pbxproj found at ${xcodeProjFile}`);
    Sentry.setTag('pbxproj-not-found', true);
    return await abort();
  }

  return new XcodeProject(pathToPbxproj);
}

export async function selectXcodeTarget(
  xcProject: XcodeProject,
  {
    targetNames = xcProject.getAllTargets(),
    noTargetMessage = `No suitable Xcode target found in ${path.basename(
      xcProject.xcodeprojPath,
    )}`,
    promptMessage = 'Which target do you want to add Sentry to?',
  }: {
    targetNames?: string[];
    noTargetMessage?: string;
    promptMessage?: string;
  } = {},
): Promise<string> {
  if (targetNames.length === 0) {
    clack.log.error(noTargetMessage);
    Sentry.setTag('No-Target', true);
    return await abort();
  }
  debug(
    `Found ${chalk.cyan(
      targetNames.length.toString(),
    )} targets in Xcode project`,
  );

  let target: string;
  if (targetNames.length === 1) {
    debug(`Found exactly one target, using it`);
    Sentry.setTag('multiple-targets', false);
    target = targetNames[0];
  } else {
    debug(`Found multiple targets, asking user to choose one`);
    Sentry.setTag('multiple-targets', true);
    target = (
      await traceStep('Choose target', () =>
        askForItemSelection(targetNames, promptMessage),
      )
    ).value;
  }
  debug(`Selected target: ${chalk.cyan(target)}`);

  return target;
}
