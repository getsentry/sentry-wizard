/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { traceStep, withTelemetry } from '../telemetry';
import * as bash from '../utils/bash';
import * as SentryUtils from '../utils/sentrycli-utils';
import { SentryProjectData, WizardOptions } from '../utils/types';
import * as cocoapod from './cocoapod';
import * as codeTools from './code-tools';
import * as fastlane from './fastlane';
import { XcodeProject } from './xcode-manager';

/* eslint-enable @typescript-eslint/no-unused-vars */

import {
  abort,
  askForItemSelection,
  askToInstallSentryCLI,
  confirmContinueIfNoOrDirtyGitRepo,
  getOrAskForProjectData,
  printWelcome,
} from '../utils/clack';
import { checkInstalledCLI } from './check-installed-cli';
import { configurePackageManager } from './configure-package-manager';
import { configureSentryCLI } from './configure-sentry-cli';
import { lookupXcodeProject } from './lookup-xcode-project';
import { AppleWizardOptions } from './options';

export async function runAppleWizard(
  options: AppleWizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'ios',
      wizardOptions: options,
    },
    () => runAppleWizardWithTelementry(options),
  );
}

async function runAppleWizardWithTelementry(
  options: AppleWizardOptions,
): Promise<void> {
  // Define options with defaults
  const projectDir = options.projectDir ?? process.cwd();

  // Step - Welcome Message
  printWelcome({
    wizardName: 'Sentry Apple Wizard',
    promoCode: options.promoCode,
  });

  // Step - Git Status Check
  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: projectDir,
  });

  // Step - Sentry CLI Check
  await checkInstalledCLI();

  // Step - Xcode Project Lookup
  // This step should be run before the Sentry Project and API Key step
  // because it can abort the wizard if no Xcode project is found.
  const { xcProject, target } = await lookupXcodeProject({
    projectDir,
  });

  // Step - Sentry Project and API Key
  const { selectedProject, authToken } = await getOrAskForProjectData(
    options,
    'apple-ios',
  );

  // Step - Sentry CLI Configuration Setup
  configureSentryCLI({
    projectDir,
    authToken: authToken,
  });

  // Step - Set up Package Manager
  const { shouldUseSPM } = await configurePackageManager({
    projectDir,
  });
  traceStep('Update Xcode project', () => {
    xcProject.updateXcodeProject(project, target, !hasCocoa, true);
  });

  const codeAdded = traceStep('Add code snippet', () => {
    const files = xcProject.filesForTarget(target);
    if (files === undefined || files.length == 0) return false;

    return codeTools.addCodeSnippetToProject(
      projectDir,
      files,
      project.keys[0].dsn.public,
    );
  });

  Sentry.setTag('Snippet-Added', codeAdded);

  if (!codeAdded) {
    clack.log.warn(
      'Added the Sentry dependency to your project but could not add the Sentry code snippet. Please add the code snipped manually by following the docs: https://docs.sentry.io/platforms/apple/guides/ios/#configure',
    );
  }

  const hasFastlane = fastlane.fastFile(projectDir);
  Sentry.setTag('fastlane-exists', hasFastlane);
  if (hasFastlane) {
    const addLane = await clack.confirm({
      message:
        'Found a Fastfile in your project. Do you want to configure a lane to upload debug symbols to Sentry?',
    });
    Sentry.setTag('fastlane-desired', addLane);
    if (addLane) {
      const added = await traceStep('Configure fastlane', () =>
        fastlane.addSentryToFastlane(
          projectDir,
          project.organization.slug,
          project.slug,
        ),
      );
      Sentry.setTag('fastlane-added', added);
      if (added) {
        clack.log.step(
          'A new step was added to your fastlane file. Now and you build your project with fastlane, debug symbols and source context will be uploaded to Sentry.',
        );
      } else {
        clack.log.warn(
          'Could not edit your fastlane file to upload debug symbols to Sentry. Please follow the instructions at https://docs.sentry.io/platforms/apple/guides/ios/dsym/#fastlane',
        );
      }
    }
  }

  clack.log.success(
    'Sentry was successfully added to your project! Run your project to send your first event to Sentry. Go to Sentry.io to see whether everything is working fine.',
  );
}
