import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import * as fs from 'fs';
import {
  getNextJsVersionBucket,
  getMaybeAppDirLocation,
  hasRootLayoutFile,
} from '../../src/nextjs/utils';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  lstatSync: vi.fn(),
}));

describe('Next.js Utils', () => {
  describe('getNextJsVersionBucket', () => {
    it('returns "none" for undefined version', () => {
      expect(getNextJsVersionBucket(undefined)).toBe('none');
    });

    it('returns "<11.0.0" for versions below 11', () => {
      expect(getNextJsVersionBucket('10.0.0')).toBe('<11.0.0');
    });

    it('returns major version for versions 11 and above', () => {
      expect(getNextJsVersionBucket('11.0.0')).toBe('11.x');
    });
  });

  describe('getMaybeAppDirLocation', () => {
    const mockCwd = '/mock/cwd';
    let originalCwd: () => string;

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      originalCwd = process.cwd;
      process.cwd = vi.fn(() => mockCwd);
      vi.clearAllMocks();
    });

    afterEach(() => {
      process.cwd = originalCwd;
    });

    it('returns ["app"] when app directory exists in root', () => {
      (fs.existsSync as Mock).mockImplementation((filePath: string) => {
        return filePath === '/mock/cwd/app';
      });
      (fs.lstatSync as Mock).mockImplementation((filePath: string) => ({
        isDirectory: () => filePath === '/mock/cwd/app',
      }));

      expect(getMaybeAppDirLocation()).toEqual(['app']);
    });

    it('returns ["src", "app"] when app directory exists in src', () => {
      (fs.existsSync as Mock).mockImplementation((filePath: string) => {
        return filePath === '/mock/cwd/src/app';
      });
      (fs.lstatSync as Mock).mockImplementation((filePath: string) => ({
        isDirectory: () => filePath === '/mock/cwd/src/app',
      }));

      expect(getMaybeAppDirLocation()).toEqual(['src', 'app']);
    });

    it('returns undefined when no app directory exists', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      expect(getMaybeAppDirLocation()).toBeUndefined();
    });
  });

  describe('hasRootLayoutFile', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns true when layout file exists with any supported extension', () => {
      const mockAppFolderPath = '/mock/app';
      const supportedExtensions = ['jsx', 'tsx', 'js'];

      supportedExtensions.forEach((ext) => {
        (fs.existsSync as Mock).mockImplementation((filePath: string) => {
          return filePath === `/mock/app/layout.${ext}`;
        });

        expect(hasRootLayoutFile(mockAppFolderPath)).toBe(true);
      });
    });

    it('returns false when no layout file exists', () => {
      const mockAppFolderPath = '/mock/app';
      (fs.existsSync as Mock).mockReturnValue(false);

      expect(hasRootLayoutFile(mockAppFolderPath)).toBe(false);
    });
  });
});
