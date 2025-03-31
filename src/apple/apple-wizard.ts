/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import { traceStep, withTelemetry } from '../telemetry';
import * as SentryUtils from '../utils/sentrycli-utils';
import * as codeTools from './code-tools';

/* eslint-enable @typescript-eslint/no-unused-vars */

import {
  confirmContinueIfNoOrDirtyGitRepo,
  getOrAskForProjectData,
  printWelcome,
} from '../utils/clack';
import { checkInstalledCLI } from './check-installed-cli';
import { configureFastlane } from './configure-fastlane';
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
  SentryUtils.createSentryCLIRC(projectDir, { auth_token: authToken });
  clack.log.info(
    `Created a ${chalk.cyan(
      '.sentryclirc',
    )} file in your project directory to provide an auth token for Sentry CLI.
    
It was also added to your ${chalk.cyan('.gitignore')} file.
Set the ${chalk.cyan(
      'SENTRY_AUTH_TOKEN',
    )} environment variable in your CI environment. See https://docs.sentry.io/cli/configuration/#auth-token for more information.`,
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
    xcProject.updateXcodeProject(selectedProject, target, shouldUseSPM, true);
  });

  const codeAdded = traceStep('Add code snippet', () => {
    const files = xcProject.filesForTarget(target);
    if (files === undefined || files.length == 0) return false;

    return codeTools.addCodeSnippetToProject(
      projectDir,
      files,
      selectedProject.keys[0].dsn.public,
    );
  });

  Sentry.setTag('Snippet-Added', codeAdded);

  if (!codeAdded) {
    clack.log.warn(
      'Added the Sentry dependency to your project but could not add the Sentry code snippet. Please add the code snipped manually by following the docs: https://docs.sentry.io/platforms/apple/guides/ios/#configure',
    );
  }

  // Step - Fastlane Configuration
  await configureFastlane({
    projectDir,
    orgSlug: selectedProject.organization.slug,
    projectSlug: selectedProject.slug,
  });

  clack.log.success(
    'Sentry was successfully added to your project! Run your project to send your first event to Sentry. Go to Sentry.io to see whether everything is working fine.',
  );
}
