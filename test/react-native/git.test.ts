import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { areNativeFoldersInGitignore } from '../../src/react-native/git';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    appendFile: vi.fn(),
  },
}));

describe('git', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('areNativeFoldersInGitignore', () => {
    test('returns true when both ios and android are in gitignore', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nios\nandroid\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns true when both ios/ and android/ patterns are present', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nios/\nandroid/\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns true when both /ios and /android patterns are present', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\n/ios\nandroid\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns true when ios/* and android/* patterns are present', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nios/*\nandroid/*\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns true with mixed patterns for ios and android', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nios/\n/android\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns true when folders are in gitignore with additional content', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        '# Dependencies\nnode_modules\n\n# Native folders\nios\nandroid\n\n# Build\nbuild/\ndist/\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns false when only ios is in gitignore', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nios\nbuild\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns false when only android is in gitignore', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nandroid\nbuild\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns false when gitignore is empty', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('');

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns false when gitignore contains folders only in comments', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        '# ios folder\n# android folder\nnode_modules\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns false when gitignore contains similar names with folder names as substrings', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\niosApp\nandroidApp\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns false when gitignore file does not exist', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('ENOENT: no such file or directory'),
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns false when fs.promises.readFile throws permission error', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('EACCES: permission denied'),
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns false when fs.promises.readFile throws any error', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('Unknown error'),
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('handles gitignore with CRLF line endings', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\r\nios\r\nandroid\r\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('handles gitignore with no trailing newline', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nios\nandroid',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns true when ios appears in comment but android is present on its own line', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\n# ios - native folder\nios\nandroid\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns false when similar folder names exist but not exact native folders', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\nbiosensor\nhumanoid\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(false);
    });

    test('returns true when folders are at the start of gitignore file', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'ios\nandroid\nnode_modules\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });

    test('returns true when folders are at the start with trailing slashes', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'ios/\nandroid/\nnode_modules\n',
      );

      const result = await areNativeFoldersInGitignore();

      expect(result).toBe(true);
    });
  });
});
