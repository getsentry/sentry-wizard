import * as fs from 'node:fs';
import * as path from 'node:path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import * as bash from '../../utils/bash';
import { checkInstalledCLI } from '../check-installed-cli';
import * as fastlane from '../fastlane';
import { SENTRY_CLI_INSTALL_DOCS_URL } from '../templates';

type SnapshotVerificationGuidance = {
  appId?: string;
  hostedTestTargetName: string;
  projectDir: string;
  projectPath: string;
  schemeName?: string;
  snapshotTestClassName: string;
};

export async function checkInstalledCLISnapshots({
  projectDir,
  nonInteractive,
  verificationGuidance,
}: {
  projectDir: string;
  nonInteractive: boolean;
  verificationGuidance: SnapshotVerificationGuidance;
}): Promise<void> {
  const cli = await checkInstalledCLI(
    `Without the Sentry CLI, you won't be able to upload snapshots to Sentry. You can install it later by following the instructions at ${SENTRY_CLI_INSTALL_DOCS_URL}`,
    nonInteractive,
  );

  if (cli) {
    verifySnapshotsUploadCommand(cli);
  }

  printSnapshotsUploadGuidance({
    // Without a CLI, show the v4 command, which the installer provides.
    cli: cli ?? { binary: 'sentry', command: 'sentry' },
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

  let contents: string;
  try {
    contents = fs.readFileSync(fastfilePath, 'utf8');
  } catch {
    clack.log.warn(
      `Could not read the Fastfile at ${fastfilePath}. Skipping Fastlane snapshots upload detection.`,
    );
    return {
      hasUploadLane: false,
      hasSentryUploadAction: false,
    };
  }

  return {
    fastfilePath,
    hasUploadLane: /lane\s+:upload_sentry_snapshots\b/.test(contents),
    hasSentryUploadAction: /\bsentry_upload_snapshots\s*\(/.test(contents),
  };
}

function verifySnapshotsUploadCommand(cli: bash.SentryCli): void {
  const available = bash.commandSucceeds(cli.command, [
    'snapshots',
    'upload',
    '--help',
  ]);
  Sentry.setTag('sentry-cli-snapshots-upload', available);
  if (available) {
    clack.log.success(`${cli.binary} snapshots upload is available.`);
  } else {
    clack.log.warn(
      `${cli.binary} is installed, but this version does not expose \`${cli.binary} snapshots upload\`. Please install the latest Sentry CLI (${SENTRY_CLI_INSTALL_DOCS_URL}) before uploading snapshots.`,
    );
  }
}

function printSnapshotsUploadGuidance({
  cli,
  fastlaneGuidance,
  verificationGuidance,
}: {
  cli: bash.SentryCli;
  fastlaneGuidance: ReturnType<typeof getSnapshotFastlaneGuidance>;
  verificationGuidance: SnapshotVerificationGuidance;
}): void {
  if (fastlaneGuidance.fastfilePath && fastlaneGuidance.hasUploadLane) {
    clack.log.info(
      [
        'Detected existing Fastlane snapshots upload support.',
        buildSnapshotExportCommand(verificationGuidance),
        'Then verify upload with:',
        'bundle exec fastlane ios upload_sentry_snapshots path: "$PWD/snapshot-images"',
      ].join('\n'),
    );
    return;
  }

  if (fastlaneGuidance.fastfilePath && fastlaneGuidance.hasSentryUploadAction) {
    clack.log.info(
      [
        'Detected a Fastlane lane that calls sentry_upload_snapshots.',
        'After exporting snapshots, run that existing lane with your snapshot image path.',
        `If you are unsure which lane to use, fall back to ${cli.binary} snapshots upload below.`,
      ].join('\n'),
    );
  }

  // Use the command that detection found, such as ~/.local/bin/sentry right
  // after an install, so that the printed command runs in the same shell.
  const command = quoteShell(cli.command);
  clack.log.info(
    [
      buildSnapshotExportCommand(verificationGuidance),
      '',
      'After SnapshotPreviews exports images, verify local upload with:',
      // v4 `sentry` reads the org and project from SENTRY_ORG and
      // SENTRY_PROJECT, or from .sentryclirc, not from flags.
      ...(cli.binary === 'sentry'
        ? [
            'SENTRY_ORG=your-org SENTRY_PROJECT=your-ios-project \\',
            `${command} snapshots upload "$PWD/snapshot-images" \\`,
          ]
        : [
            `${command} snapshots upload "$PWD/snapshot-images" \\`,
            '  --org your-org \\',
            '  --project your-ios-project \\',
          ]),
      verificationGuidance.appId
        ? `  --app-id ${verificationGuidance.appId}`
        : '  --app-id YOUR_APP_BUNDLE_ID # replace with your app bundle identifier',
      '',
      'Auth comes from the SENTRY_AUTH_TOKEN environment variable or a .sentryclirc file. In CI, set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT, and SENTRY_URL for self-hosted Sentry. CI workflow setup is documented at https://docs.sentry.io/platforms/apple/snapshots/#step-3-integrate-into-ci; this wizard does not write workflow files.',
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
      `${guidance.hostedTestTargetName}/${guidance.snapshotTestClassName}`,
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
