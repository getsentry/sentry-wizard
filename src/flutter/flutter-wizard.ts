import { WizardOptions } from '../utils/types';
import * as Sentry from '@sentry/node';
import * as codetools from './code-tools';

// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';

import {
  confirmContinueIfNoOrDirtyGitRepo,
  getOrAskForProjectData,
  printWelcome,
} from '../utils/clack-utils';

import { traceStep, withTelemetry } from '../telemetry';
import { findFile } from './code-tools';

export async function runFlutterWizard(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'android',
      wizardOptions: options,
    },
    () => runFlutterWizardWithTelemetry(options),
  );
}

async function runFlutterWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Flutter Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const { selectedProject, selfHosted, sentryUrl, authToken } =
    await getOrAskForProjectData(options, 'flutter');
  
  const projectDir = process.cwd();
  const pubspecFile = findFile(projectDir, 'pubspec.yaml');

  // ======== STEP 1. Add sentry_flutter and sentry_dart_plugin to pubspec.yaml ============
  clack.log.step(
    `Adding ${chalk.bold('Sentry')} to your apps ${chalk.cyan('pubspec.yaml',)} file.`,
  );
  const pubspecPatched = await traceStep('Patch pubspec.yaml', () =>
    codetools.patchPubspec(
      pubspecFile,
      selectedProject.slug,
      selectedProject.organization.slug
    ),
  );
  if (!pubspecPatched) {
    clack.log.warn(
      "Could not add Sentry to your apps pubspec.yaml file. You'll have to add it manually.\nPlease follow the instructions at https://docs.sentry.io/platforms/flutter/#install",
    );
  }
  Sentry.setTag('pubspec-patched', pubspecPatched);

  // ======== STEP 2. Add sentry.properties with auth token ============

  const propertiesAdded = traceStep('Add sentry.properties', () =>
    codetools.addProperties(pubspecFile, authToken),
  );
  if (!propertiesAdded) {
    clack.log.warn(
      `We could not add "sentry.properties" file in your project directory in order to provide an auth token for Sentry CLI. You'll have to add it manually, or you can set the SENTRY_AUTH_TOKEN environment variable instead. See https://docs.sentry.io/cli/configuration/#auth-token for more information.`,
    );
  } else {
    clack.log.info(
      `We created "sentry.properties" file in your project directory in order to provide an auth token for Sentry CLI.\nIt was also added to your ".gitignore" file.\nAt your CI enviroment, you can set the SENTRY_AUTH_TOKEN environment variable instead. See https://docs.sentry.io/cli/configuration/#auth-token for more information.`,
    );
  }
  Sentry.setTag('sentry-properties-added', pubspecPatched);

  // ======== STEP 3. Patch main.dart with setup and a test error snippet ============
  clack.log.step(
    `Patching ${chalk.bold('main.dart')} with setup and test error snippet.`,
  );

  const mainFile = findFile(`${projectDir}/lib`, 'main.dart');
  const dsn = selectedProject.keys[0].dsn.public;

  const mainPatched = await traceStep('Patch main.dart', () =>
    codetools.patchMain(mainFile, dsn),
  );
  if (!mainPatched) {
    clack.log.warn(
      "Could not patch main.dart file. You'll have to manually verify the setup.\nPlease follow the instructions at https://docs.sentry.io/platforms/flutter/#verify",
    );
  }
  Sentry.setTag('main-patched', mainPatched);

  // ======== OUTRO ========

  const issuesPageLink = selfHosted
    ? `${sentryUrl}organizations/${selectedProject.organization.slug}/issues/?project=${selectedProject.id}`
    : `https://${selectedProject.organization.slug}.sentry.io/issues/?project=${selectedProject.id}`;

  clack.outro(`
    ${chalk.greenBright('Successfully installed the Sentry Flutter SDK!')}
    
    ${chalk.cyan(
      `You can validate your setup by launching your application and checking Sentry issues page afterwards
    ${issuesPageLink}`,
    )}
    
    Check out the SDK documentation for further configuration:
    https://docs.sentry.io/platforms/flutter/
  `);
};
