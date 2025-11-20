import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentViteConfig } from '../../../src/react-router/codemods/vite';

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

describe('Vite Config Instrumentation', () => {
  const mockCwd = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('instrumentViteConfig', () => {
    it('should throw error if vite config file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        instrumentViteConfig('my-org', 'my-project'),
      ).rejects.toThrow('Could not find vite.config.ts or vite.config.js');
    });

    it('should detect and skip if Sentry content already exists', async () => {
      const existingConfig = `import { defineConfig } from 'vite';
import { sentryReactRouter } from '@sentry/react-router';

export default defineConfig({
  plugins: [sentryReactRouter({ org: "my-org", project: "my-project" }, config)]
});`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(existingConfig);

      const result = await instrumentViteConfig('my-org', 'my-project');

      expect(result.wasConverted).toBe(false);
    });

    it('should add sentryReactRouter plugin and convert to function form', async () => {
      const simpleConfig = `import { defineConfig } from 'vite';

export default defineConfig({
  plugins: []
});`;

      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(simpleConfig);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      const result = await instrumentViteConfig('my-org', 'my-project');

      expect(result.wasConverted).toBe(true);

      const writtenConfig = Object.values(writtenFiles)[0];
      expect(writtenConfig).toContain('sentryReactRouter');
      expect(writtenConfig).toContain('org: "my-org"');
      expect(writtenConfig).toContain('project: "my-project"');
      expect(writtenConfig).toContain('config =>');
    });

    it('should work with existing function form', async () => {
      const functionConfig = `import { defineConfig } from 'vite';

export default defineConfig(config => ({
  plugins: []
}));`;

      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(functionConfig);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      const result = await instrumentViteConfig('my-org', 'my-project');

      expect(result.wasConverted).toBe(false);

      const writtenConfig = Object.values(writtenFiles)[0];
      expect(writtenConfig).toContain('sentryReactRouter');
      expect(writtenConfig).toContain('org: "my-org"');
      expect(writtenConfig).toContain('project: "my-project"');
    });

    it('should prefer vite.config.ts over vite.config.js', async () => {
      const configContent = `import { defineConfig } from 'vite';
export default defineConfig({ plugins: [] });`;

      const writtenFiles: Record<string, string> = {};

      // First call checks for vite.config.ts (returns true), second call validates it exists
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(configContent);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      await instrumentViteConfig('my-org', 'my-project');

      // Should write to vite.config.ts, not vite.config.js
      const writtenPath = Object.keys(writtenFiles)[0];
      expect(writtenPath).toContain('vite.config.ts');
      expect(writtenPath).not.toContain('vite.config.js');
    });

    it('should work with function expression form', async () => {
      const functionConfig = `import { defineConfig } from 'vite';

export default defineConfig(function(config) {
  return {
    plugins: []
  };
});`;

      const writtenFiles: Record<string, string> = {};

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(functionConfig);
      vi.mocked(fs.promises.writeFile).mockImplementation(
        (filePath, content) => {
          writtenFiles[filePath as string] = content as string;
          return Promise.resolve();
        },
      );

      const result = await instrumentViteConfig('my-org', 'my-project');

      expect(result.wasConverted).toBe(false);

      const writtenConfig = Object.values(writtenFiles)[0];
      expect(writtenConfig).toContain('sentryReactRouter');
      expect(writtenConfig).toContain('org: "my-org"');
      expect(writtenConfig).toContain('project: "my-project"');
    });
  });
});
