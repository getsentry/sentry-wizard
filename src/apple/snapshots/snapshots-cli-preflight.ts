import * as fs from 'node:fs';
import * as path from 'node:path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import * as bash from '../../utils/bash';
import { checkInstalledCLI } from '../check-installed-cli';
import * as fastlane from '../fastlane';
import { snapshotTestClassName } from './snapshot-test-file';

type SnapshotVerificationGuidance = {
  appId?: string;
  hostedTestTargetName: string;
  projectDir: string;
  projectPath: string;
  schemeName?: string;
};

export async function checkInstalledCLISnapshots({
  projectDir,
  nonInteractive,
  verificationGuidance,
}: {
  projectDir: string;
  nonInteractive?: boolean;
  verificationGuidance: SnapshotVerificationGuidance;
}): Promise<void> {
  const hasCli = await checkInstalledCLI(
    "Without sentry-cli, you won't be able to upload snapshots to Sentry. You can install it later by following the instructions at https://docs.sentry.io/cli/",
    nonInteractive,
  );

  if (hasCli) {
    verifySnapshotsUploadCommand();
  }

  printSnapshotsUploadGuidance({
    fastlaneGuidance: getSnapshotFastlaneGuidance(projectDir),
    verificationGuidance,
  });
}

export function getSnapshotFastlaneGuidance(projectDir: string) {
  const fastfilePath = fastlane.fastFile(projectDir) ?? undefined;
  if (!fastfilePath) {
    return {
      hasUploadLane: false,
      hasSentryUploadAction: false,
    };
  }

  const contents = fs.readFileSync(fastfilePath, 'utf8');
  return {
    fastfilePath,
    hasUploadLane: /lane\s+:upload_sentry_snapshots\b/.test(contents),
    hasSentryUploadAction: /\bsentry_upload_snapshots\s*\(/.test(contents),
  };
}

function verifySnapshotsUploadCommand(): void {
  try {
    bash.executeSync('sentry-cli snapshots upload --help');
    Sentry.setTag('sentry-cli-snapshots-upload', true);
    clack.log.success('sentry-cli snapshots upload is available.');
  } catch {
    Sentry.setTag('sentry-cli-snapshots-upload', false);
    clack.log.warn(
      'sentry-cli is installed, but this version does not expose `sentry-cli snapshots upload`. Please update sentry-cli before uploading snapshots.',
    );
  }
}

function printSnapshotsUploadGuidance({
  fastlaneGuidance,
  verificationGuidance,
}: {
  fastlaneGuidance: ReturnType<typeof getSnapshotFastlaneGuidance>;
  verificationGuidance: SnapshotVerificationGuidance;
}): void {
  if (fastlaneGuidance.fastfilePath && fastlaneGuidance.hasUploadLane) {
    clack.log.info(
      [
        'Detected existing Fastlane snapshots upload support.',
        buildSnapshotExportCommand(verificationGuidance),
        'Then verify upload with:',
        'bundle exec fastlane ios upload_sentry_snapshots path:"$PWD/snapshot-images"',
      ].join('\n'),
    );
    return;
  }

  if (fastlaneGuidance.fastfilePath && fastlaneGuidance.hasSentryUploadAction) {
    clack.log.info(
      [
        'Detected a Fastlane lane that calls sentry_upload_snapshots.',
        'After exporting snapshots, run that existing lane with your snapshot image path.',
        'If you are unsure which lane to use, fall back to sentry-cli snapshots upload below.',
      ].join('\n'),
    );
  }

  clack.log.info(
    [
      buildSnapshotExportCommand(verificationGuidance),
      '',
      'After SnapshotPreviews exports images, verify local upload with:',
      'sentry-cli snapshots upload "$PWD/snapshot-images" \\',
      '  --org your-org \\',
      '  --project your-ios-project \\',
      verificationGuidance.appId
        ? `  --app-id ${verificationGuidance.appId}`
        : '  --app-id YOUR_APP_BUNDLE_ID # replace with your app bundle identifier',
      '',
      'Auth comes from SENTRY_AUTH_TOKEN or --auth-token. CI workflow setup is documented at https://docs.sentry.io/platforms/apple/snapshots/#step-3-integrate-into-ci; this wizard does not write workflow files.',
    ].join('\n'),
  );
}

function buildSnapshotExportCommand(
  guidance: SnapshotVerificationGuidance,
): string {
  return [
    `From ${quoteShell(guidance.projectDir)}, export snapshots with:`,
    'TEST_RUNNER_SNAPSHOTS_EXPORT_DIR="$PWD/snapshot-images" \\',
    'xcodebuild test \\',
    `  -project ${quoteShell(
      path.relative(guidance.projectDir, guidance.projectPath) ||
        guidance.projectPath,
    )} \\`,
    `  -scheme ${
      guidance.schemeName ? quoteShell(guidance.schemeName) : '<scheme>'
    } \\`,
    "  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \\",
    `  -only-testing:${quoteShell(
      `${guidance.hostedTestTargetName}/${snapshotTestClassName(
        guidance.hostedTestTargetName,
      )}`,
    )} \\`,
    '  CODE_SIGNING_ALLOWED=NO \\',
    '  | xcpretty',
  ].join('\n');
}

function quoteShell(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}
