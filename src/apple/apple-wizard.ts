/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as fs from 'fs';
import * as path from 'path';
import * as xcManager from './xcode-manager';
import * as codeTools from './code-tools';
import * as bash from '../utils/bash';
import { WizardOptions } from '../utils/types';
import * as Sentry from '@sentry/node';
import { traceStep, withTelemetry } from '../telemetry';

const xcode = require('xcode');
/* eslint-enable @typescript-eslint/no-unused-vars */

import {
  askForProjectSelection,
  askForSelfHosted,
  askForWizardLogin,
  askToInstallSentryCLI,
  SentryProjectData,
  printWelcome,
  abort,
  askForItemSelection,
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
  const xcodeProjFiles = findFilesWithExtension(projectDir, '.xcodeproj');

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
    clack.log.error(`No pbxproj found at ${pbxproj}`);
    await abort();
    return;
  }

  const { project, apiKey } = await getSentryProjectAndApiKey(
    options.promoCode,
    options.url,
  );

  traceStep('Update Xcode project', () => {
    xcManager.updateXcodeProject(pbxproj, project, apiKey, true, true);
  });

  const projSource = path.join(
    projectDir,
    xcodeProjFile.replace('.xcodeproj', ''),
  );
  const codeAdded = traceStep('Add code snippet', () => {
    return codeTools.addCodeSnippetToProject(
      projSource,
      project.keys[0].dsn.public,
    );
  });
  if (!codeAdded) {
    clack.log.warn(
      'Added the Sentry dependency to your project but could not add the Sentry code snippet. Please add the code snipped manually by following the docs: https://docs.sentry.io/platforms/apple/guides/ios/#configure',
    );
    return;
  }

  clack.log.success('Sentry was successfully added to your project!');
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

//find files with the given extension
function findFilesWithExtension(dir: string, extension: string): string[] {
  const files = fs.readdirSync(dir);
  return files.filter((file) => file.endsWith(extension));
}
