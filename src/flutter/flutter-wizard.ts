import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as path from 'path';
import { fetchSdkVersion } from '../utils/release-registry';
import { WizardOptions } from '../utils/types';
import * as codetools from './code-tools';
import { initSnippetColored, pubspecSnippetColored } from './templates';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';

import {
  confirmContinueIfNoOrDirtyGitRepo,
  getOrAskForProjectData,
  printWelcome,
  showCopyPasteInstructions,
} from '../utils/clack';

import { traceStep, withTelemetry } from '../telemetry';
import { findFile } from './code-tools';
import { offerProjectScopedMcpConfig } from '../utils/clack/mcp-config';

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

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

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
    await showCopyPasteInstructions({
      filename: 'pubspec.yaml',
      codeSnippet: pubspecSnippetColored(
        flutterVersionOrAny,
        pluginVersionOrAny,
        selectedProject.slug,
        selectedProject.organization.slug,
      ),
      hint: 'This ensures the Sentry SDK and plugin can be imported.',
    });
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
      `Created a ${chalk.cyan(
        'sentry.properties',
      )} file in your project directory to provide an auth token for Sentry CLI.
It was also added to your ${chalk.cyan('.gitignore')} file.
Set the ${chalk.cyan(
        'SENTRY_AUTH_TOKEN',
      )} environment variable in your CI environment. See https://docs.sentry.io/cli/configuration/#auth-token for more information.`,
    );
  }
  Sentry.setTag('sentry-properties-added', pubspecPatched);

  // ======== STEP 3. Patch main.dart with setup and a test error snippet ============

  clack.log.step(
    `Next, the wizard will patch your ${chalk.cyan(
      'main.dart',
    )} file with the SDK init and a test error snippet.`,
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
    await showCopyPasteInstructions({
      filename: 'main.dart',
      codeSnippet: initSnippetColored(dsn),
      hint: 'This ensures the Sentry SDK is ready to capture errors.',
    });
  }
  Sentry.setTag('main-patched', mainPatched);

  // ======== OUTRO ========

  // Offer optional project-scoped MCP config for Sentry with org and project scope
  await offerProjectScopedMcpConfig(
    selectedProject.organization.slug,
    selectedProject.slug,
  );

  const issuesPageLink = selfHosted
    ? `${sentryUrl}organizations/${selectedProject.organization.slug}/issues/?project=${selectedProject.id}`
    : `https://${selectedProject.organization.slug}.sentry.io/issues/?project=${selectedProject.id}`;

  clack.outro(`
    ${chalk.greenBright('Successfully installed the Sentry Flutter SDK!')}
    
    ${chalk.cyan('Next steps:')}
    1. Run ${chalk.bold(
      'flutter run',
    )} to test the setup - we've added a test error that will trigger on app start
    2. For production builds, run ${chalk.bold(
      'flutter build apk --obfuscate --split-debug-info=build/debug-info',
    )} (or ios/macos) then ${chalk.bold(
    'flutter pub run sentry_dart_plugin',
  )} to upload debug symbols
    3. View your test error and transaction data at ${issuesPageLink}
    
    ${chalk.cyan('Learn more:')}
    - Debug Symbols: https://docs.sentry.io/platforms/dart/guides/flutter/debug-symbols/
    - Performance Monitoring: https://docs.sentry.io/platforms/dart/guides/flutter/performance/
    - Integrations: https://docs.sentry.io/platforms/dart/guides/flutter/integrations/
  `);
}
