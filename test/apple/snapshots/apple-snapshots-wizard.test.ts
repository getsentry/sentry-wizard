import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  askForItemSelection: vi.fn(),
  checkInstalledCLISnapshots: vi.fn(),
  confirm: vi.fn(),
  confirmContinueIfNoOrDirtyGitRepo: vi.fn(),
  configureSnapshotPreviewsXcodeProject: vi.fn(),
  ensureSnapshotTestFile: vi.fn(),
  info: vi.fn(),
  lookupXcodeProject: vi.fn(),
  outro: vi.fn(),
  printWelcome: vi.fn(),
  resolveSnapshotVerificationSchemeName: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  withTelemetry: vi.fn(
    async (_options: { integration: string }, callback: () => Promise<void>) =>
      await callback(),
  ),
  write: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  default: {
    confirm: mocks.confirm,
    log: {
      info: mocks.info,
      success: mocks.success,
      warn: mocks.warn,
    },
    outro: mocks.outro,
  },
}));

vi.mock('../../../src/telemetry', () => ({
  withTelemetry: mocks.withTelemetry,
}));

vi.mock('../../../src/utils/clack', () => ({
  abortIfCancelled: async <T>(value: T | Promise<T>) => await value,
  askForItemSelection: mocks.askForItemSelection,
  confirmContinueIfNoOrDirtyGitRepo: mocks.confirmContinueIfNoOrDirtyGitRepo,
  printWelcome: mocks.printWelcome,
}));

vi.mock('../../../src/apple/lookup-xcode-project', () => ({
  lookupXcodeProject: mocks.lookupXcodeProject,
  selectXcodeTarget: async (
    xcodeProject: { getAllTargets: () => string[] },
    options: {
      targetNames?: string[];
      promptMessage?: string;
    } = {},
  ): Promise<string> => {
    const targetNames = options.targetNames ?? xcodeProject.getAllTargets();
    if (targetNames.length === 1) {
      return targetNames[0];
    }

    const askForItemSelection = mocks.askForItemSelection as (
      items: string[],
      message: string,
    ) => Promise<{ value: string }>;
    const selection = await askForItemSelection(
      targetNames,
      options.promptMessage ?? 'Which target do you want to add Sentry to?',
    );
    return selection.value;
  },
}));

vi.mock('../../../src/apple/snapshots/snapshot-test-file', () => ({
  ensureSnapshotTestFile: mocks.ensureSnapshotTestFile,
}));

vi.mock(
  '../../../src/apple/snapshots/configure-snapshotpreviews-xcode-project',
  () => ({
    configureSnapshotPreviewsXcodeProject:
      mocks.configureSnapshotPreviewsXcodeProject,
  }),
);

vi.mock('../../../src/apple/snapshots/snapshots-cli-preflight', () => ({
  checkInstalledCLISnapshots: mocks.checkInstalledCLISnapshots,
}));

vi.mock('../../../src/apple/snapshots/snapshot-verification-scheme', () => ({
  resolveSnapshotVerificationSchemeName:
    mocks.resolveSnapshotVerificationSchemeName,
}));

import { runAppleSnapshotsWizard } from '../../../src/apple/snapshots/apple-snapshots-wizard';

describe('runAppleSnapshotsWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureSnapshotTestFile.mockReturnValue({
      changed: true,
      included: true,
    });
    mocks.configureSnapshotPreviewsXcodeProject.mockReturnValue({
      changed: true,
      linked: true,
    });
    mocks.resolveSnapshotVerificationSchemeName.mockReturnValue('AppScheme');
    mocks.askForItemSelection.mockResolvedValue({ value: 'App' });
    mocks.confirm.mockResolvedValue(false);
  });

  it('links SnapshotPreferences only to the selected app target', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-wizard-'));
    const selectedPreviewFile = path.join(tempDir, 'SelectedView.swift');
    const otherPreviewFile = path.join(tempDir, 'OtherView.swift');
    fs.writeFileSync(
      selectedPreviewFile,
      '#Preview { SelectedView() }',
      'utf8',
    );
    fs.writeFileSync(otherPreviewFile, '#Preview { OtherView() }', 'utf8');
    mocks.askForItemSelection.mockResolvedValue({ value: 'App' });
    const xcodeProject = {
      getBundleIdentifierForTarget: vi.fn(() => 'com.getsentry.App'),
      getSourceFilesForTarget: vi.fn((targetName: string) =>
        targetName === 'App' ? [selectedPreviewFile] : [otherPreviewFile],
      ),
      getAllTargets: vi.fn(() => ['App', 'OtherApp']),
      getHostedUnitTestTargetNamesForApplicationTarget: vi.fn(() => [
        'AppTests',
      ]),
      getUnitTestTargetNames: vi.fn(() => ['AppTests']),
      write: mocks.write,
      xcodeprojPath: path.join(tempDir, 'App.xcodeproj'),
    };
    mocks.lookupXcodeProject.mockResolvedValue(xcodeProject);

    await runAppleSnapshotsWizard({
      telemetryEnabled: true,
      projectDir: tempDir,
      promoCode: 'CAM',
      ignoreGitChanges: true,
    });

    expect(mocks.askForItemSelection).toHaveBeenCalledWith(
      ['App', 'OtherApp'],
      'Which app target hosts your Swift previews?',
    );
    expect(mocks.configureSnapshotPreviewsXcodeProject).toHaveBeenCalledWith({
      xcodeProject,
      hostedTestTargetName: 'AppTests',
      previewTargetNames: ['App'],
    });
  });

  it('prompts only among unit-test targets hosted by the selected app target', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-wizard-'));
    const previewFile = path.join(tempDir, 'ContentView.swift');
    fs.writeFileSync(previewFile, '#Preview { ContentView() }', 'utf8');
    mocks.askForItemSelection.mockResolvedValue({
      value: 'AppSnapshotTests',
    });
    const xcodeProject = {
      getBundleIdentifierForTarget: vi.fn(() => 'com.getsentry.App'),
      getSourceFilesForTarget: vi.fn(() => [previewFile]),
      getAllTargets: vi.fn(() => ['App']),
      getHostedUnitTestTargetNamesForApplicationTarget: vi.fn(() => [
        'AppTests',
        'AppSnapshotTests',
      ]),
      write: mocks.write,
      xcodeprojPath: path.join(tempDir, 'App.xcodeproj'),
    };
    mocks.lookupXcodeProject.mockResolvedValue(xcodeProject);

    await runAppleSnapshotsWizard({
      telemetryEnabled: true,
      projectDir: tempDir,
      promoCode: 'CAM',
      ignoreGitChanges: true,
    });

    expect(
      xcodeProject.getHostedUnitTestTargetNamesForApplicationTarget,
    ).toHaveBeenCalledWith('App');
    expect(mocks.askForItemSelection).toHaveBeenCalledWith(
      ['AppTests', 'AppSnapshotTests'],
      'Which test target should render SnapshotPreviews?',
    );
    expect(mocks.configureSnapshotPreviewsXcodeProject).toHaveBeenCalledWith({
      xcodeProject,
      hostedTestTargetName: 'AppSnapshotTests',
      previewTargetNames: ['App'],
    });
  });

  it('does not link SnapshotPreferences when the selected app target has no Swift previews', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-wizard-'));
    const selectedFile = path.join(tempDir, 'SelectedView.swift');
    const otherPreviewFile = path.join(tempDir, 'OtherView.swift');
    fs.writeFileSync(selectedFile, 'struct SelectedView {}', 'utf8');
    fs.writeFileSync(otherPreviewFile, '#Preview { OtherView() }', 'utf8');
    mocks.askForItemSelection.mockResolvedValue({ value: 'App' });
    mocks.confirm.mockResolvedValue(true);
    const xcodeProject = {
      getBundleIdentifierForTarget: vi.fn(() => 'com.getsentry.App'),
      getSourceFilesForTarget: vi.fn((targetName: string) =>
        targetName === 'App' ? [selectedFile] : [otherPreviewFile],
      ),
      getAllTargets: vi.fn(() => ['App', 'OtherApp']),
      getHostedUnitTestTargetNamesForApplicationTarget: vi.fn(() => [
        'AppTests',
      ]),
      getUnitTestTargetNames: vi.fn(() => ['AppTests']),
      write: mocks.write,
      xcodeprojPath: path.join(tempDir, 'App.xcodeproj'),
    };
    mocks.lookupXcodeProject.mockResolvedValue(xcodeProject);

    await runAppleSnapshotsWizard({
      telemetryEnabled: true,
      projectDir: tempDir,
      promoCode: 'CAM',
      ignoreGitChanges: true,
    });

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('No Swift previews were found'),
    );
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.configureSnapshotPreviewsXcodeProject).toHaveBeenCalledWith({
      xcodeProject,
      hostedTestTargetName: 'AppTests',
      previewTargetNames: [],
    });
  });

  it('wires the Apple Snapshots flow without Sentry auth/runtime/CI mutation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-wizard-'));
    const previewFile = path.join(tempDir, 'ContentView.swift');
    fs.writeFileSync(previewFile, '#Preview { ContentView() }', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'Package.swift'), '', 'utf8');
    const xcodeProject = {
      getBundleIdentifierForTarget: vi.fn(() => 'com.getsentry.App'),
      getSourceFilesForTarget: vi.fn(() => [previewFile]),
      getAllTargets: vi.fn(() => ['App']),
      getHostedUnitTestTargetNamesForApplicationTarget: vi.fn(() => [
        'AppTests',
      ]),
      getUnitTestTargetNames: vi.fn(() => ['AppTests']),
      write: mocks.write,
      xcodeprojPath: path.join(tempDir, 'App.xcodeproj'),
    };
    mocks.lookupXcodeProject.mockResolvedValue(xcodeProject);

    await runAppleSnapshotsWizard({
      telemetryEnabled: true,
      projectDir: tempDir,
      promoCode: 'CAM',
      ignoreGitChanges: true,
    });

    expect(mocks.withTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ integration: 'appleSnapshots' }),
      expect.any(Function),
    );
    expect(mocks.printWelcome).toHaveBeenCalledWith({
      wizardName: 'Sentry Apple Snapshots Wizard',
      promoCode: 'CAM',
    });
    expect(mocks.confirmContinueIfNoOrDirtyGitRepo).toHaveBeenCalledWith({
      ignoreGitChanges: true,
      cwd: tempDir,
    });
    expect(mocks.lookupXcodeProject).toHaveBeenCalledWith({
      projectDir: tempDir,
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('SnapshotPreferences in Swift preview files'),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      expect.stringContaining('This wizard does not edit SwiftPM manifests'),
    );
    expect(mocks.ensureSnapshotTestFile).toHaveBeenCalledWith({
      xcodeProject,
      hostedTestTargetName: 'AppTests',
    });
    expect(mocks.configureSnapshotPreviewsXcodeProject).toHaveBeenCalledWith({
      xcodeProject,
      hostedTestTargetName: 'AppTests',
      previewTargetNames: ['App'],
    });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.checkInstalledCLISnapshots).toHaveBeenCalledWith({
      projectDir: tempDir,
      verificationGuidance: {
        appId: 'com.getsentry.App',
        hostedTestTargetName: 'AppTests',
        projectDir: tempDir,
        projectPath: path.join(tempDir, 'App.xcodeproj'),
        schemeName: 'AppScheme',
      },
    });
    expect(mocks.outro).toHaveBeenCalledWith(
      expect.stringContaining(
        'No Sentry auth, DSN, runtime SDK, dSYM, or CI workflow files',
      ),
    );
  });
});
