import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import * as fs from 'fs';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import {
  addWithSentryConfigImport,
  getNextJsVersionBucket,
  getMaybeAppDirLocation,
  hasRootLayoutFile,
  isNextJsVersionSupported,
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
      expect(getNextJsVersionBucket('11.2.5')).toBe('11.x');
      expect(getNextJsVersionBucket('13.5.2')).toBe('13.x');
      expect(getNextJsVersionBucket('14.0.0')).toBe('14.x');
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

  describe('isNextJsVersionSupported', () => {
    it.each(['14.0.0', '^14.2.0', '15.5.21', '~16.2.0', '17.0.0-canary.1'])(
      'returns true for %s',
      (version) => {
        expect(isNextJsVersionSupported(version)).toBe(true);
      },
    );

    it.each(['13.5.6', '^13.0.0', '12.3.4', '11.0.0'])(
      'returns false for %s',
      (version) => {
        expect(isNextJsVersionSupported(version)).toBe(false);
      },
    );

    it.each([undefined, 'latest', 'not-a-version'])(
      'returns true when the version is unknown (%s)',
      (version) => {
        expect(isNextJsVersionSupported(version)).toBe(true);
      },
    );
  });

  describe('addWithSentryConfigImport', () => {
    it('adds the import from @sentry/nextjs/config when none exists', () => {
      const mod = parseModule('export default {};');

      addWithSentryConfigImport(mod);

      expect(mod.generate().code).toContain(
        'import {withSentryConfig} from "@sentry/nextjs/config";',
      );
    });

    it('rewrites an existing import from the root @sentry/nextjs export', () => {
      const mod = parseModule(
        'import { withSentryConfig } from "@sentry/nextjs";\nexport default withSentryConfig({});',
      );

      addWithSentryConfigImport(mod);

      const code = mod.generate().code;
      expect(code.match(/withSentryConfig.*from/g)).toHaveLength(1);
      expect(code).toContain('from "@sentry/nextjs/config"');
      expect(code).not.toContain('from "@sentry/nextjs"');
    });

    it('leaves an existing import from @sentry/nextjs/config untouched', () => {
      const mod = parseModule(
        'import { withSentryConfig } from "@sentry/nextjs/config";\nexport default withSentryConfig({});',
      );

      addWithSentryConfigImport(mod);

      expect(mod.generate().code.match(/withSentryConfig.*from/g)).toHaveLength(
        1,
      );
    });
  });
});
