import * as fs from 'node:fs';
import * as path from 'node:path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

import { withTelemetry } from '../../telemetry';
import {
  abortIfCancelled,
  askForItemSelection,
  confirmContinueIfNoOrDirtyGitRepo,
  printWelcome,
} from '../../utils/clack';
import { lookupXcodeProject, selectXcodeTarget } from '../lookup-xcode-project';
import type { AppleSnapshotsWizardOptions } from '../options';
import type { XcodeProject } from '../xcode-manager';
import { checkInstalledCLISnapshots } from './snapshots-cli-preflight';
import { configureSnapshotPreviewsXcodeProject } from './configure-snapshotpreviews-xcode-project';
import {
  ensureSnapshotTestFile,
  snapshotTestClassName,
  snapshotTestTemplate,
} from './snapshot-test-file';
import { resolveSnapshotVerificationSchemeName } from './snapshot-verification-scheme';
import {
  SNAPSHOTPREVIEWS_MINIMUM_VERSION,
  SNAPSHOTPREVIEWS_PACKAGE_URL,
  SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT,
  SNAPSHOTPREVIEWS_SNAPSHOT_TESTS_PRODUCT,
} from './snapshotpreviews-package';

export async function runAppleSnapshotsWizard(
  options: AppleSnapshotsWizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'appleSnapshots',
      wizardOptions: options,
    },
    () => runAppleSnapshotsWizardWithTelemetry(options),
  );
}

async function runAppleSnapshotsWizardWithTelemetry(
  options: AppleSnapshotsWizardOptions,
): Promise<void> {
  const projectDir = options.projectDir ?? process.cwd();

  printWelcome({
    wizardName: 'Sentry Apple Snapshots Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: projectDir,
    nonInteractive: options.nonInteractive,
  });

  clack.log.info(
    [
      `Apple Snapshots setup will use ${SNAPSHOTPREVIEWS_PACKAGE_URL}`,
      `${SNAPSHOTPREVIEWS_MINIMUM_VERSION}+ and link`,
      `${SNAPSHOTPREVIEWS_SNAPSHOT_TESTS_PRODUCT} to the hosted XCTest`,
      `target and ${SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT} to the selected`,
      'app target if it declares Swift previews.',
    ].join(' '),
  );

  const xcProject = await lookupXcodeProject({
    projectDir,
    nonInteractive: options.nonInteractive,
  });

  const appTargetName = await resolveAppTargetName(xcProject, options);
  if (!appTargetName) {
    return;
  }

  const hostedTestTargetName = await resolveHostedTestTargetName(
    xcProject,
    appTargetName,
    options,
  );
  if (!hostedTestTargetName) {
    return;
  }

  const selectedTargetHasSwiftPreviews = targetHasSwiftPreviews(
    xcProject,
    appTargetName,
  );

  if (!selectedTargetHasSwiftPreviews) {
    clack.log.warn(
      'No Swift previews were found. SnapshotPreviews needs Swift previews or an existing image generator to produce useful snapshots.',
    );

    if (options.nonInteractive) {
      clack.log.info(
        'Continuing without Swift previews in non-interactive mode. Add Swift previews to the app target to generate useful snapshots.',
      );
    } else {
      const continueWithoutPreviews = await abortIfCancelled(
        clack.confirm({
          message:
            'Do you want to continue with SnapshotPreviews setup anyway?',
          initialValue: false,
        }),
      );
      if (!continueWithoutPreviews) {
        clack.outro('Apple Snapshots setup cancelled.');
        return;
      }
    }
  }

  const previewTargetNames = selectedTargetHasSwiftPreviews
    ? [appTargetName]
    : [];

  if (previewTargetNames.length) {
    clack.log.info(
      [
        `${SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT} will be linked to the selected`,
        'app target. Import SnapshotPreferences in Swift preview files only',
        'if you want to use SnapshotPreviews modifiers.',
      ].join(' '),
    );
  }

  if (fs.existsSync(path.join(projectDir, 'Package.swift'))) {
    clack.log.info(
      [
        'Detected Package.swift. This wizard does not edit SwiftPM manifests.',
        `If SwiftPM preview targets use SnapshotPreferences modifiers, add`,
        `the ${SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT} product dependency to those`,
        'targets in Package.swift.',
      ].join(' '),
    );
  }

  const packageResult = configureSnapshotPreviewsXcodeProject({
    xcodeProject: xcProject,
    hostedTestTargetName,
    previewTargetNames,
  });

  if (!packageResult.linked) {
    clack.log.error(
      'SnapshotPreviews package products could not be linked to the selected targets. Please check the Xcode project target build phases and try again.',
    );
    clack.outro('Apple Snapshots setup did not complete.');
    return;
  }

  const snapshotTestResult = ensureSnapshotTestFile({
    xcodeProject: xcProject,
    hostedTestTargetName,
  });
  if (!snapshotTestResult.included) {
    clack.log.error(
      'SnapshotPreviews test file could not be added to the selected XCTest target. Please check the target Sources build phase and try again.',
    );
    clack.outro('Apple Snapshots setup did not complete.');
    return;
  }

  if (snapshotTestResult.changed || packageResult.changed) {
    xcProject.write();
    clack.log.success('Updated the Xcode project for SnapshotPreviews.');
  } else {
    clack.log.info('SnapshotPreviews Xcode project setup is already present.');
  }

  await checkInstalledCLISnapshots({
    projectDir,
    nonInteractive: options.nonInteractive,
    verificationGuidance: {
      appId: xcProject.getBundleIdentifierForTarget(appTargetName),
      hostedTestTargetName,
      projectDir,
      projectPath: xcProject.xcodeprojPath,
      schemeName: resolveSnapshotVerificationSchemeName({
        hostedTestTargetName,
        xcodeprojPath: xcProject.xcodeprojPath,
      }),
    },
  });

  clack.outro(
    'Apple Snapshots setup complete. No Sentry auth, DSN, runtime SDK, dSYM, or CI workflow files were configured.',
  );
}

async function resolveAppTargetName(
  xcodeProject: XcodeProject,
  options: AppleSnapshotsWizardOptions,
): Promise<string | undefined> {
  const appTargetNames = xcodeProject.getAllTargets();
  if (options.appTarget) {
    if (appTargetNames.includes(options.appTarget)) {
      return options.appTarget;
    }

    clack.log.error(
      `Xcode app target ${
        options.appTarget
      } was not found. Available app targets: ${formatList(appTargetNames)}.`,
    );
    clack.outro('Apple Snapshots setup did not complete.');
    return undefined;
  }

  if (options.nonInteractive && appTargetNames.length !== 1) {
    clack.log.error(
      [
        'Could not automatically select an Xcode app target in non-interactive mode.',
        `Available app targets: ${formatList(appTargetNames)}.`,
        'Pass --app-target <target-name> to select the app target that hosts your Swift previews.',
      ].join(' '),
    );
    clack.outro('Apple Snapshots setup did not complete.');
    return undefined;
  }

  return await selectXcodeTarget(xcodeProject, {
    targetNames: appTargetNames,
    noTargetMessage: 'No application target found.',
    promptMessage: 'Which app target hosts your Swift previews?',
  });
}

async function resolveHostedTestTargetName(
  xcodeProject: XcodeProject,
  appTargetName: string,
  options: AppleSnapshotsWizardOptions,
): Promise<string | undefined> {
  const hostedTestTargetNames = xcodeProject.getHostedUnitTestTargetNames();
  if (options.hostedTestTarget) {
    if (hostedTestTargetNames.includes(options.hostedTestTarget)) {
      return options.hostedTestTarget;
    }

    clack.log.error(
      [
        `Hosted XCTest target ${options.hostedTestTarget} was not found or does not define TEST_HOST.`,
        `Available hosted XCTest targets: ${formatList(
          hostedTestTargetNames,
        )}.`,
      ].join(' '),
    );
    clack.outro('Apple Snapshots setup did not complete.');
    return undefined;
  }

  const inferredHostedTestTargetNames =
    xcodeProject.getHostedUnitTestTargetNamesForApplicationTarget(
      appTargetName,
    );
  if (inferredHostedTestTargetNames.length > 0) {
    return await selectHostedTestTargetName({
      appTargetName,
      hostedTestTargetNames: inferredHostedTestTargetNames,
      nonInteractive: options.nonInteractive,
      promptMessage: 'Which test target should render SnapshotPreviews?',
    });
  }

  if (hostedTestTargetNames.length === 0) {
    clack.log.error(
      [
        `No hosted XCTest target was found for ${appTargetName}.`,
        manualAppleSnapshotsSetupInstructions({ appTargetName }),
      ].join('\n'),
    );
    clack.outro('Apple Snapshots setup did not complete.');
    return undefined;
  }

  clack.log.warn(
    [
      `Could not automatically match a hosted XCTest target to ${appTargetName}.`,
      'This can happen when TEST_HOST uses Xcode build-setting macros for the app bundle or executable name.',
    ].join(' '),
  );

  return await selectHostedTestTargetName({
    appTargetName,
    hostedTestTargetNames,
    nonInteractive: options.nonInteractive,
    promptMessage: 'Which hosted XCTest target should render SnapshotPreviews?',
  });
}

async function selectHostedTestTargetName({
  appTargetName,
  hostedTestTargetNames,
  nonInteractive,
  promptMessage,
}: {
  appTargetName: string;
  hostedTestTargetNames: string[];
  nonInteractive: boolean | undefined;
  promptMessage: string;
}): Promise<string | undefined> {
  if (hostedTestTargetNames.length === 1) {
    return hostedTestTargetNames[0];
  }

  if (nonInteractive) {
    clack.log.error(
      [
        `Could not automatically select the hosted XCTest target for ${appTargetName} in non-interactive mode.`,
        `Available hosted XCTest targets: ${formatList(
          hostedTestTargetNames,
        )}.`,
        'Pass --hosted-test-target <target-name> to select the target explicitly.',
        manualAppleSnapshotsSetupInstructions({
          appTargetName,
          hostedTestTargetName: hostedTestTargetNames[0],
        }),
      ].join('\n'),
    );
    clack.outro('Apple Snapshots setup did not complete.');
    return undefined;
  }

  const selection = await abortIfCancelled(
    askForItemSelection(hostedTestTargetNames, promptMessage),
  );
  return selection.value;
}

function manualAppleSnapshotsSetupInstructions({
  appTargetName,
  hostedTestTargetName,
}: {
  appTargetName: string;
  hostedTestTargetName?: string;
}): string {
  const exampleHostedTestTargetName = hostedTestTargetName ?? 'AppTests';
  const sourceFileInstruction = hostedTestTargetName
    ? '3. Add this XCTest source file to the hosted XCTest target:'
    : `3. Add this XCTest source file to the hosted XCTest target. This example assumes the hosted XCTest target is named ${exampleHostedTestTargetName}:`;

  return [
    'Manual setup:',
    `1. Add the ${SNAPSHOTPREVIEWS_SNAPSHOT_TESTS_PRODUCT} package product to the hosted XCTest target for ${appTargetName}.`,
    `2. Add the ${SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT} package product to ${appTargetName} if its Swift previews use SnapshotPreviews modifiers.`,
    sourceFileInstruction,
    '```swift',
    snapshotTestTemplate(
      snapshotTestClassName(exampleHostedTestTargetName),
    ).trimEnd(),
    '```',
    '4. Run the hosted XCTest target with xcodebuild.',
  ].join('\n');
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function targetHasSwiftPreviews(
  xcodeProject: XcodeProject,
  targetName: string,
): boolean {
  const sourceFiles = xcodeProject.getSourceFilesForTarget(targetName) ?? [];
  return sourceFiles.some((filePath) => {
    if (!filePath.endsWith('.swift') || !fs.existsSync(filePath)) {
      return false;
    }

    const contents = fs.readFileSync(filePath, 'utf8');
    return (
      contents.includes('#Preview') || contents.includes('PreviewProvider')
    );
  });
}
