/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as fs from 'fs';
import * as path from 'path';
import { XcodeProject } from './xcode-manager';
import * as codeTools from './code-tools';
import * as bash from '../utils/bash';
import { SentryProjectData, WizardOptions } from '../utils/types';
import * as Sentry from '@sentry/node';
import { traceStep, withTelemetry } from '../telemetry';
import * as cocoapod from './cocoapod';
import * as fastlane from './fastlane';

const xcode = require('xcode');
/* eslint-enable @typescript-eslint/no-unused-vars */

import {
  askForProjectSelection,
  askForSelfHosted,
  askForWizardLogin,
  askToInstallSentryCLI,
  printWelcome,
  abort,
  askForItemSelection,
  confirmContinueEvenThoughNoGitRepo,
} from '../utils/clack-utils';

export async function runAppleWizard(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'ios',
    },
    () => runAppleWizardWithTelementry(options),
  );
}

async function runAppleWizardWithTelementry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Apple Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const hasCli = bash.hasSentryCLI();
  Sentry.setTag('has-cli', hasCli);
  if (!hasCli) {
    if (
      !(await traceStep('Ask for SentryCLI', () => askToInstallSentryCLI()))
    ) {
      clack.log.warn(
        "Without sentry-cli, you won't be able to upload debug symbols to Sentry. You can install it later by following the instructions at https://docs.sentry.io/cli/",
      );
      Sentry.setTag('CLI-Installed', false);
    } else {
      await bash.installSentryCLI();
      Sentry.setTag('CLI-Installed', true);
    }
  }

  const projectDir = process.cwd();
  const xcodeProjFiles = searchXcodeProject(projectDir);

  if (!xcodeProjFiles || xcodeProjFiles.length === 0) {
    clack.log.error(
      'No Xcode project found. Please run this command from the root of your project.',
    );
    await abort();
    return;
  }

  let xcodeProjFile;

  if (xcodeProjFiles.length === 1) {
    xcodeProjFile = xcodeProjFiles[0];
    Sentry.setTag('multiple-projects', false);
  } else {
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

  const pbxproj = path.join(projectDir, xcodeProjFile, 'project.pbxproj');

  if (!fs.existsSync(pbxproj)) {
    clack.log.error(`No pbxproj found at ${xcodeProjFile}`);
    await abort();
    return;
  }

  const { project, apiKey } = await getSentryProjectAndApiKey(
    options.promoCode,
    options.url,
  );

  const xcProject = new XcodeProject(pbxproj);

  const availableTargets = xcProject.getAllTargets();

  if (availableTargets.length == 0) {
    clack.log.error(`No suttable target found in ${xcodeProjFile}`);
    await abort();
    return;
  }

  const target =
    availableTargets.length == 1
      ? availableTargets[0]
      : (
          await traceStep('Choose target', () =>
            askForItemSelection(
              availableTargets,
              'Which target do you want to add Sentry to?',
            ),
          )
        ).value;

  const hasCocoa = cocoapod.usesCocoaPod(projectDir);

  if (hasCocoa) {
    const podAdded = await traceStep('Add CocoaPods reference', () =>
      cocoapod.addCocoaPods(projectDir),
    );
    if (!podAdded) {
      clack.log.warn(
        "Could not add Sentry pod to your Podfile. You'll have to add it manually.\nPlease follow the instructions at https://docs.sentry.io/platforms/apple/guides/ios/#install",
      );
    }
  }

  traceStep('Update Xcode project', () => {
    xcProject.updateXcodeProject(project, target, apiKey, !hasCocoa, true);
  });

  Sentry.setTag('package-manager', hasCocoa ? 'cocoapods' : 'SPM');
  const codeAdded = traceStep('Add code snippet', () => {
    const files = xcProject.filesForTarget(target);
    if (files === undefined || files.length == 0) return false;

    return codeTools.addCodeSnippetToProject(
      projectDir,
      files,
      project.keys[0].dsn.public,
    );
  });
  if (!codeAdded) {
    clack.log.warn(
      'Added the Sentry dependency to your project but could not add the Sentry code snippet. Please add the code snipped manually by following the docs: https://docs.sentry.io/platforms/apple/guides/ios/#configure',
    );
    return;
  }

  if (fastlane.fastFile(projectDir)) {
    const addLane = await clack.confirm({
      message:
        'Found a Fastfile in your project. Do you want to configure a lane to upload debug symbols to Sentry?',
    });
    if (addLane) {
      const added = await traceStep('Configure fastlane', () =>
        fastlane.addSentryToFastlane(
          projectDir,
          project.organization.slug,
          project.slug,
          apiKey.token,
        ),
      );
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

//Prompt for Sentry project and API key
async function getSentryProjectAndApiKey(
  promoCode?: string,
  url?: string,
): Promise<{ project: SentryProjectData; apiKey: { token: string } }> {
  const { url: sentryUrl } = await askForSelfHosted(url);

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: promoCode,
    url: sentryUrl,
    platform: 'apple-ios',
  });

  const selectedProject = await askForProjectSelection(projects);
  return { project: selectedProject, apiKey: apiKeys };
}

function searchXcodeProject(at: string): string[] {
  const projs = findFilesWithExtension(at, '.xcodeproj');
  if (projs.length > 0) {
    return projs;
  }

  const workspace = findFilesWithExtension(at, '.xcworkspace');
  if (workspace.length == 0) {
    return [];
  }

  const xsworkspacedata = path.join(
    at,
    workspace[0],
    'contents.xcworkspacedata',
  );
  if (!fs.existsSync(xsworkspacedata)) {
    return [];
  }
  const groupRegex = /location *= *"group:([^"]+)"/gim;
  const content = fs.readFileSync(xsworkspacedata, 'utf8');
  let matches = groupRegex.exec(content);

  while (matches) {
    const group = matches[1];
    const groupPath = path.join(at, group);
    if (
      !group.endsWith('Pods.xcodeproj') &&
      group.endsWith('.xcodeproj') &&
      fs.existsSync(groupPath)
    ) {
      projs.push(group);
    }
    matches = groupRegex.exec(content);
  }
  return projs;
}

//find files with the given extension
function findFilesWithExtension(dir: string, extension: string): string[] {
  const files = fs.readdirSync(dir);
  return files.filter((file) => file.endsWith(extension));
}
