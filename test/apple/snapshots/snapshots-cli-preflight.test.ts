import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  askToInstallSentryCLI: vi.fn(),
  executeSync: vi.fn(),
  hasSentryCLI: vi.fn(),
  info: vi.fn(),
  installSentryCLI: vi.fn(),
  setTag: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  default: {
    log: {
      info: mocks.info,
      success: mocks.success,
      warn: mocks.warn,
    },
  },
}));

vi.mock('@sentry/node', () => ({
  setTag: mocks.setTag,
}));

vi.mock('../../../src/telemetry', () => ({
  traceStep: async (_name: string, callback: () => Promise<boolean>) =>
    await callback(),
}));

vi.mock('../../../src/utils/bash', () => ({
  executeSync: mocks.executeSync,
  hasSentryCLI: mocks.hasSentryCLI,
  installSentryCLI: mocks.installSentryCLI,
}));

vi.mock('../../../src/utils/clack', () => ({
  askToInstallSentryCLI: mocks.askToInstallSentryCLI,
}));

import {
  checkInstalledCLISnapshots,
  getSnapshotFastlaneGuidance,
} from '../../../src/apple/snapshots/snapshots-cli-preflight';

function getVerificationGuidance(projectDir: string) {
  return {
    appId: 'com.getsentry.App',
    hostedTestTargetName: 'AppTests',
    projectDir,
    projectPath: path.join(projectDir, 'App.xcodeproj'),
    schemeName: 'App',
    snapshotTestClassName: 'AppTestsSnapshotTest',
  };
}

describe('snapshots CLI preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers to install sentry-cli with snapshots-aware warning when missing', async () => {
    mocks.hasSentryCLI.mockReturnValue(false);
    mocks.askToInstallSentryCLI.mockResolvedValue(false);

    const projectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'snapshot-cli-missing-'),
    );

    await checkInstalledCLISnapshots({
      projectDir,
      verificationGuidance: getVerificationGuidance(projectDir),
    });

    expect(mocks.askToInstallSentryCLI).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('upload snapshots to Sentry'),
    );
    expect(mocks.executeSync).not.toHaveBeenCalled();
  });

  it('verifies snapshots upload support and prefers existing Fastlane guidance', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-cli-'));
    const fastlaneDir = path.join(projectDir, 'fastlane');
    fs.mkdirSync(fastlaneDir);
    fs.writeFileSync(
      path.join(fastlaneDir, 'Fastfile'),
      'platform :ios do\n  lane :upload_sentry_snapshots do |options|\n    sentry_upload_snapshots(path: options[:path])\n  end\nend\n',
    );
    mocks.hasSentryCLI.mockReturnValue(true);

    await checkInstalledCLISnapshots({
      projectDir,
      verificationGuidance: getVerificationGuidance(projectDir),
    });

    expect(mocks.executeSync).toHaveBeenCalledWith(
      'sentry-cli snapshots upload --help',
    );
    expect(mocks.success).toHaveBeenCalledWith(
      'sentry-cli snapshots upload is available.',
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('xcodebuild test'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('-project App.xcodeproj'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('-scheme App'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('-only-testing:AppTests/AppTestsSnapshotTest'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'bundle exec fastlane ios upload_sentry_snapshots',
      ),
    );
  });

  it('prints xcodebuild export and sentry-cli upload guidance', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-cli-'));
    mocks.hasSentryCLI.mockReturnValue(true);

    await checkInstalledCLISnapshots({
      projectDir,
      verificationGuidance: getVerificationGuidance(projectDir),
    });

    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('TEST_RUNNER_SNAPSHOTS_EXPORT_DIR'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('-only-testing:AppTests/AppTestsSnapshotTest'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('sentry-cli snapshots upload'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('--app-id com.getsentry.App'),
    );
  });

  it('uses the provided snapshot test class name in xcodebuild guidance', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-cli-'));
    mocks.hasSentryCLI.mockReturnValue(true);

    await checkInstalledCLISnapshots({
      projectDir,
      verificationGuidance: {
        ...getVerificationGuidance(projectDir),
        snapshotTestClassName: 'CustomSnapshots',
      },
    });

    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('-only-testing:AppTests/CustomSnapshots'),
    );
    expect(mocks.info).not.toHaveBeenCalledWith(
      expect.stringContaining('-only-testing:AppTests/AppTestsSnapshotTest'),
    );
  });

  it('uses a scheme placeholder when no verification scheme was detected', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-cli-'));
    mocks.hasSentryCLI.mockReturnValue(true);

    await checkInstalledCLISnapshots({
      projectDir,
      verificationGuidance: {
        ...getVerificationGuidance(projectDir),
        schemeName: undefined,
      },
    });

    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('-scheme <scheme>'),
    );
    expect(mocks.info).not.toHaveBeenCalledWith(
      expect.stringContaining("-scheme '<scheme>'"),
    );
  });

  it('uses an explicit app id placeholder when the bundle identifier is unavailable', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-cli-'));
    const verificationGuidance = {
      ...getVerificationGuidance(projectDir),
      appId: undefined,
    };
    mocks.hasSentryCLI.mockReturnValue(true);

    await checkInstalledCLISnapshots({
      projectDir,
      verificationGuidance,
    });

    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('--app-id YOUR_APP_BUNDLE_ID'),
    );
    expect(mocks.info).not.toHaveBeenCalledWith(
      expect.stringContaining('com.example.MyApp'),
    );
    expect(mocks.info).not.toHaveBeenCalledWith(
      expect.stringContaining('<your-app-bundle-id>'),
    );
  });

  it('detects existing Fastlane snapshots upload support', () => {
    const projectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'snapshot-fastlane-'),
    );
    const fastlaneDir = path.join(projectDir, 'fastlane');
    fs.mkdirSync(fastlaneDir);
    fs.writeFileSync(
      path.join(fastlaneDir, 'Fastfile'),
      'lane :upload_sentry_snapshots do\n  sentry_upload_snapshots(path: "snapshot-images")\nend\n',
    );

    expect(getSnapshotFastlaneGuidance(projectDir)).toEqual({
      fastfilePath: path.join(fastlaneDir, 'Fastfile'),
      hasUploadLane: true,
      hasSentryUploadAction: true,
    });
  });
});
