import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentReactRouterConfig } from '../../../src/react-router/codemods/react-router-config';

vi.mock('@clack/prompts', () => ({
  default: {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    },
  },
}));
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

describe('React Router Config File Instrumentation', () => {
  const mockCwd = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('instrumentReactRouterConfig', () => {
    it('should create new config file if it does not exist', async () => {
      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      const result = await instrumentReactRouterConfig(true);

      expect(result.ssrWasChanged).toBe(false);

      const configPath = path.join(mockCwd, 'react-router.config.ts');
      expect(writtenFiles[configPath]).toContain('ssr: true');
      expect(writtenFiles[configPath]).toContain('sentryOnBuildEnd');
      expect(writtenFiles[configPath]).toContain('buildEnd:');
    });

    it('should create .js config when TypeScript is not used', async () => {
      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      await instrumentReactRouterConfig(false);

      const configPath = path.join(mockCwd, 'react-router.config.js');
      expect(writtenFiles[configPath]).toBeDefined();
      // Verify JS config doesn't have TypeScript-only syntax
      expect(writtenFiles[configPath]).not.toContain('import type');
      expect(writtenFiles[configPath]).not.toContain('satisfies Config');
      expect(writtenFiles[configPath]).toContain('sentryOnBuildEnd');
      expect(writtenFiles[configPath]).toContain('buildEnd:');
    });

    it('should detect and skip if Sentry content already exists', async () => {
      const existingConfig = `import { sentryOnBuildEnd } from '@sentry/react-router';

export default {
  ssr: true,
  buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
    await sentryOnBuildEnd({ viteConfig, reactRouterConfig, buildManifest });
  }
};`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(existingConfig);

      const result = await instrumentReactRouterConfig(true);

      expect(result.ssrWasChanged).toBe(false);
    });

    it('should add buildEnd hook to existing config', async () => {
      const existingConfig = `export default {
  ssr: true,
  async: false
};`;

      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(existingConfig);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      const result = await instrumentReactRouterConfig(true);

      expect(result.ssrWasChanged).toBe(false);

      const writtenConfig = Object.values(writtenFiles)[0];
      expect(writtenConfig).toContain('sentryOnBuildEnd');
      expect(writtenConfig).toContain('buildEnd:');
    });

    it('should set ssr: true if missing', async () => {
      const existingConfig = `export default {
  async: false
};`;

      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(existingConfig);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      const result = await instrumentReactRouterConfig(true);

      expect(result.ssrWasChanged).toBe(true);

      const writtenConfig = Object.values(writtenFiles)[0];
      expect(writtenConfig).toContain('ssr: true');
    });

    it('should report ssrWasChanged when changing ssr from false to true', async () => {
      const existingConfig = `export default {
  ssr: false
};`;

      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(existingConfig);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      const result = await instrumentReactRouterConfig(true);

      expect(result.ssrWasChanged).toBe(true);

      const writtenConfig = Object.values(writtenFiles)[0];
      expect(writtenConfig).toContain('ssr: true');
    });

    it('should throw error if buildEnd already exists', async () => {
      const existingConfig = `export default {
  ssr: true,
  buildEnd: async () => {
    console.log('existing hook');
  }
};`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(existingConfig);

      await expect(instrumentReactRouterConfig(true)).rejects.toThrow(
        'A buildEnd hook already exists',
      );
    });
  });
});
