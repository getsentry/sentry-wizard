import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cocoapod from '../../src/apple/cocoapod';
import { configurePackageManager } from '../../src/apple/configure-package-manager';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clack/prompts', () => ({
  __esModule: true,
  default: {
    log: {
      warn: vi.fn(),
      step: vi.fn(),
    },
    select: vi.fn(),
  },
}));

vi.mock('../../src/apple/cocoapod');
vi.mock('../../src/utils/clack', () => ({
  abortIfCancelled: vi.fn((value: unknown) => Promise.resolve(value)),
}));

vi.mock('../../src/telemetry', () => ({
  traceStep: vi.fn(
    async (_name: string, fn: () => Promise<unknown>) => await fn(),
  ),
}));

vi.mock('../../src/utils/debug', () => ({
  debug: vi.fn(),
}));

vi.mock('@sentry/node', async () => {
  const actual = await vi.importActual<typeof import('@sentry/node')>(
    '@sentry/node',
  );
  return {
    ...actual,
    setTag: vi.fn(),
    captureException: vi.fn(() => 'id'),
  };
});

describe('configurePackageManager', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-project'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when CocoaPods is not available', () => {
    it('should default to SPM and not prompt user', async () => {
      // -- Arrange --
      vi.spyOn(cocoapod, 'usesCocoaPod').mockReturnValue(false);

      // -- Act --
      const result = await configurePackageManager({ projectDir });

      // -- Assert --
      expect(result.shouldUseSPM).toBe(true);
      expect(clack.select).not.toHaveBeenCalled();
      expect(clack.log.warn).not.toHaveBeenCalled();
      expect(Sentry.setTag).toHaveBeenCalledWith('cocoapod-exists', false);
      expect(Sentry.setTag).toHaveBeenCalledWith('package-manager', 'SPM');
    });
  });

  describe('when CocoaPods is available', () => {
    beforeEach(() => {
      vi.spyOn(cocoapod, 'usesCocoaPod').mockReturnValue(true);
    });

    it('should show deprecation warning', async () => {
      // -- Arrange --
      vi.mocked(clack.select).mockResolvedValue('SPM' as never);

      // -- Act --
      await configurePackageManager({ projectDir });

      // -- Assert --
      expect(clack.log.warn).toHaveBeenCalledWith(
        'CocoaPods is being deprecated. No new updates will be released after June 2026.\nWe recommend migrating to Swift Package Manager (SPM).',
      );
    });

    it('should prompt user to choose package manager', async () => {
      // -- Arrange --
      vi.mocked(clack.select).mockResolvedValue('SPM' as never);

      // -- Act --
      await configurePackageManager({ projectDir });

      // -- Assert --
      expect(clack.select).toHaveBeenCalledWith({
        message: 'Which package manager would you like to use to add Sentry?',
        options: [
          {
            value: 'SPM',
            label: 'Swift Package Manager',
            hint: 'Recommended',
          },
          {
            value: 'CocoaPods',
            label: 'CocoaPods',
            hint: 'Deprecated - no updates after June 2026',
          },
        ],
      });
    });

    it('should use SPM when user selects SPM', async () => {
      // -- Arrange --
      vi.mocked(clack.select).mockResolvedValue('SPM' as never);

      // -- Act --
      const result = await configurePackageManager({ projectDir });

      // -- Assert --
      expect(result.shouldUseSPM).toBe(true);
      expect(cocoapod.addCocoaPods).not.toHaveBeenCalled();
      expect(Sentry.setTag).toHaveBeenCalledWith('cocoapod-exists', true);
      expect(Sentry.setTag).toHaveBeenCalledWith('package-manager', 'SPM');
    });

    it('should use CocoaPods when user selects CocoaPods', async () => {
      // -- Arrange --
      vi.mocked(clack.select).mockResolvedValue('CocoaPods' as never);
      vi.spyOn(cocoapod, 'addCocoaPods').mockResolvedValue(true);

      // -- Act --
      const result = await configurePackageManager({ projectDir });

      // -- Assert --
      expect(result.shouldUseSPM).toBe(false);
      expect(cocoapod.addCocoaPods).toHaveBeenCalledWith(projectDir);
      expect(Sentry.setTag).toHaveBeenCalledWith('cocoapod-exists', true);
      expect(Sentry.setTag).toHaveBeenCalledWith('cocoapod-added', true);
      expect(Sentry.setTag).toHaveBeenCalledWith(
        'package-manager',
        'CocoaPods',
      );
    });

    it('should handle CocoaPods addition failure', async () => {
      // -- Arrange --
      vi.mocked(clack.select).mockResolvedValue('CocoaPods' as never);
      vi.spyOn(cocoapod, 'addCocoaPods').mockResolvedValue(false);

      // -- Act --
      const result = await configurePackageManager({ projectDir });

      // -- Assert --
      expect(result.shouldUseSPM).toBe(false);
      expect(cocoapod.addCocoaPods).toHaveBeenCalledWith(projectDir);
      expect(Sentry.setTag).toHaveBeenCalledWith('cocoapod-added', false);
      expect(Sentry.setTag).toHaveBeenCalledWith(
        'package-manager',
        'CocoaPods',
      );
    });
  });
});
