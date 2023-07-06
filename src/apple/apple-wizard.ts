/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as templates from './templates';
import * as xcManager from './xcode-manager';
import * as codeTools from './code-tools';
import * as bash from '../utils/bash';

const xcode = require('xcode');
/* eslint-enable @typescript-eslint/no-unused-vars */

import {
  askForProjectSelection,
  askForSelfHosted,
  askForWizardLogin,
  askToInstallSentryCLI,
  SentryProjectData,
  printWelcome,
} from '../utils/clack-utils';

interface AppleWizardOptions {
  promoCode?: string;
}

export async function runAppleWizard(
  options: AppleWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Apple Wizard',
    promoCode: options.promoCode,
  });

  let hasCLI = bash.hasSentryCLI();
  if (!hasCLI) {
    if (!(await askToInstallSentryCLI())) {
      clack.log.warn("Without Sentry-cli, you won't be able to upload debug symbols to Sentry. You can install it later by following the instructions at https://docs.sentry.io/cli/");
    } else {
      await bash.installSentryCLI();
      hasCLI = true;
    }
  }

  const projectDir = process.cwd();
  const xcodeProjFile = findXcodeProjFile(projectDir);

  if (!xcodeProjFile) {
    clack.log.error('No xcode project found. Please run this command from the root of your project.');
    return;
  }

  const pbxproj = path.join(projectDir, xcodeProjFile, "project.pbxproj");
  if (!fs.existsSync(pbxproj)) {
    clack.log.error(`No pbxproj found at ${pbxproj}`);
    return;
  }

  const { project, apiKey } = await getSentryProjectAndApiKey(options.promoCode);

  xcManager.updateXcodeProject(pbxproj, project, apiKey, true, true);

  const codeAdded = codeTools.addCodeSnippetToProject(projectDir, project.keys[0].dsn.public);
  if (!codeAdded) {
    clack.log.warn('Sentry dependency was added to your project, but could not add Sentry code snippet to it. Please add it manually by following this: https://docs.sentry.io/platforms/apple/guides/ios/#configure');
    return;
  }

  clack.log.success('Sentry was successfully added to your project!');
}

//Prompt for Sentry project and API key
async function getSentryProjectAndApiKey(promoCode: string | undefined): Promise<{ project: SentryProjectData, apiKey: { token: string } }> {
  const { url: sentryUrl } = await askForSelfHosted();

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: promoCode,
    url: sentryUrl,
    platform: 'javascript-nextjs',
  });

  const selectedProject = await askForProjectSelection(projects);
  return { project: selectedProject, apiKey: apiKeys };
}

//find files with the given extension
function findFilesWithExtension(dir: string, extension: string): string[] {
  const files = fs.readdirSync(dir);
  const foundFiles: string[] = [];
  for (const file of files) {
    if (file.endsWith(extension)) {
      foundFiles.push(file);
    }
  }
  return foundFiles;
}

//Find a file that contains the xcodeproj extension
function findXcodeProjFile(dir: string): string | null {
  const files = findFilesWithExtension(dir, ".xcodeproj");
  if (files.length > 0) {
    return files[0];
  }
  return null;
}