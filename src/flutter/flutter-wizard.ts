import { WizardOptions } from '../utils/types';
import * as Sentry from '@sentry/node';
import * as codetools from './code-tools';
import * as fs from 'fs';
import * as path from 'path';
import { showCopyPasteInstructions } from '../utils/clack-utils';
import { pubspecSnippetColored, initSnippetColored } from './templates';
import { fetchSdkVersion } from '../utils/release-registry';
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
      integration: 'flutter',
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
  const pubspecFile = path.join(projectDir, 'pubspec.yaml');
  if (!fs.existsSync(pubspecFile)) {
    clack.log.error(
      `Could not find ${chalk.cyan(
        'pubspec.yaml',
      )}. Make sure you run the wizard in the projects root folder.`,
    );
    return;
  }

  // ======== STEP 1. Add sentry_flutter and sentry_dart_plugin to pubspec.yaml ============

  clack.log.step(
    `Adding ${chalk.bold('Sentry')} to your apps ${chalk.cyan(
      'pubspec.yaml',
    )} file.`,
  );

  const flutterVersion = await fetchSdkVersion('sentry.dart.flutter');
  const flutterVersionOrAny = flutterVersion ? `^${flutterVersion}` : 'any';

  const pluginVersion = await fetchSdkVersion('sentry.dart.plugin');
  const pluginVersionOrAny = pluginVersion ? `^${pluginVersion}` : 'any';

  const pubspecPatched = traceStep('Patch pubspec.yaml', () =>
    codetools.patchPubspec(
      pubspecFile,
      flutterVersionOrAny,
      pluginVersionOrAny,
      selectedProject.slug,
      selectedProject.organization.slug,
    ),
  );
  if (!pubspecPatched) {
    clack.log.warn(
      `Could not patch ${chalk.cyan(
        'pubspec.yaml',
      )}. Add the dependencies to it.`,
    );
    await showCopyPasteInstructions(
      'pubspec.yaml',
      pubspecSnippetColored(
        flutterVersionOrAny,
        pluginVersionOrAny,
        selectedProject.slug,
        selectedProject.organization.slug,
      ),
      'This ensures the Sentry SDK and plugin can be imported.',
    );
  }
  Sentry.setTag('pubspec-patched', pubspecPatched);

  // ======== STEP 2. Add sentry.properties with auth token ============

  const propertiesAdded = traceStep('Add sentry.properties', () =>
    codetools.addProperties(pubspecFile, authToken),
  );
  if (!propertiesAdded) {
    clack.log.warn(
      `We could not add ${chalk.cyan(
        'sentry.properties',
      )} file in your project directory in order to provide an auth token for Sentry CLI. You'll have to add it manually, or you can set the SENTRY_AUTH_TOKEN environment variable instead. See https://docs.sentry.io/cli/configuration/#auth-token for more information.`,
    );
  } else {
    clack.log.info(
      `We created ${chalk.cyan(
        'sentry.properties',
      )} file in your project directory in order to provide an auth token for Sentry CLI.\nIt was also added to your ".gitignore" file.\nAt your CI enviroment, you can set the SENTRY_AUTH_TOKEN environment variable instead. See https://docs.sentry.io/cli/configuration/#auth-token for more information.`,
    );
  }
  Sentry.setTag('sentry-properties-added', pubspecPatched);

  // ======== STEP 3. Patch main.dart with setup and a test error snippet ============

  clack.log.step(
    `Patching ${chalk.cyan('main.dart')} with setup and test error snippet.`,
  );

  const mainFile = findFile(`${projectDir}/lib`, 'main.dart');
  const dsn = selectedProject.keys[0].dsn.public;
  const canEnableProfiling =
    fs.existsSync(`${projectDir}/ios`) || fs.existsSync(`${projectDir}/macos`);

  const mainPatched = await traceStep('Patch main.dart', () =>
    codetools.patchMain(mainFile, dsn, canEnableProfiling),
  );
  if (!mainPatched) {
    clack.log.warn(
      `Could not patch ${chalk.cyan(
        'main.dart',
      )} file. Place the following code snippet within the apps main function.`,
    );
    await showCopyPasteInstructions(
      'main.dart',
      initSnippetColored(dsn),
      'This ensures the Sentry SDK is ready to capture errors.',
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
}
