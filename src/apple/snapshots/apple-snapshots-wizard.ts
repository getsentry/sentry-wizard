import * as fs from 'node:fs';
import * as path from 'node:path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

import { withTelemetry } from '../../telemetry';
import {
  confirmContinueIfNoOrDirtyGitRepo,
  printWelcome,
} from '../../utils/clack';
import { lookupXcodeProject, selectXcodeTarget } from '../lookup-xcode-project';
import type { AppleWizardOptions } from '../options';
import { checkInstalledCLISnapshots } from './snapshots-cli-preflight';
import { configureSnapshotPreviewsXcodeProject } from './configure-snapshotpreviews-xcode-project';
import { ensureSnapshotTestFile } from './snapshot-test-file';
import { resolveSnapshotVerificationSchemeName } from './snapshot-verification-scheme';
import {
  SNAPSHOTPREVIEWS_MINIMUM_VERSION,
  SNAPSHOTPREVIEWS_PACKAGE_URL,
  SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT,
  SNAPSHOTPREVIEWS_SNAPSHOT_TESTS_PRODUCT,
} from './snapshotpreviews-package';

export async function runAppleSnapshotsWizard(
  options: AppleWizardOptions,
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
  options: AppleWizardOptions,
): Promise<void> {
  const projectDir = options.projectDir ?? process.cwd();

  printWelcome({
    wizardName: 'Sentry Apple Snapshots Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: projectDir,
  });

  clack.log.info(
    [
      `Apple Snapshots setup will use ${SNAPSHOTPREVIEWS_PACKAGE_URL}`,
      `${SNAPSHOTPREVIEWS_MINIMUM_VERSION}+ and link`,
      `${SNAPSHOTPREVIEWS_SNAPSHOT_TESTS_PRODUCT} to the hosted XCTest`,
      `target and ${SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT} to the selected`,
      'app target.',
    ].join(' '),
  );

  const xcProject = await lookupXcodeProject({ projectDir });

  const appTargetName = await selectXcodeTarget(xcProject, {
    noTargetMessage: 'No application target found.',
    promptMessage: 'Which app target should SnapshotPreviews use?',
  });

  const hostedTestTargetNames =
    xcProject.getHostedUnitTestTargetNamesForApplicationTarget(appTargetName);
  const hostedTestTargetName = await selectXcodeTarget(xcProject, {
    targetNames: hostedTestTargetNames,
    noTargetMessage: [
      `No hosted unit-test target was found for ${appTargetName}.`,
      'Please configure a unit-test target with TEST_HOST pointing at that app target, then run the wizard again.',
    ].join(' '),
    promptMessage: 'Which test target should render SnapshotPreviews?',
  });

  const previewTargetNames = [appTargetName];

  clack.log.info(
    [
      `${SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT} will be linked to the selected`,
      'app target when possible. Import SnapshotPreferences in Swift',
      'preview files only if you want to use SnapshotPreviews modifiers.',
    ].join(' '),
  );

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

  if (packageResult.failedSnapshotPreferencesTargetNames.length) {
    clack.log.warn(
      [
        `${SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT} could not be linked to`,
        packageResult.failedSnapshotPreferencesTargetNames.join(', '),
        'because the target Frameworks build phase could not be updated.',
        'Apple Snapshots setup will continue; link the product manually if',
        'you want to use SnapshotPreviews modifiers in Swift previews.',
      ].join(' '),
    );
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
    verificationGuidance: {
      appId: xcProject.getBundleIdentifierForTarget(appTargetName),
      hostedTestTargetName,
      projectDir,
      projectPath: xcProject.xcodeprojPath,
      schemeName: resolveSnapshotVerificationSchemeName({
        hostedTestTargetName,
        xcodeprojPath: xcProject.xcodeprojPath,
      }),
      snapshotTestClassName: snapshotTestResult.className,
    },
  });

  clack.outro(
    'Apple Snapshots setup complete. No Sentry auth, DSN, runtime SDK, dSYM, or CI workflow files were configured.',
  );
}
