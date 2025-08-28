import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createExamplePage } from '../../src/react-router/sdk-example';

// Mock dependencies
vi.mock('fs');
vi.mock('@clack/prompts', () => {
  const mock = {
    log: {
      warn: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  };
  return {
    default: mock,
    ...mock,
  };
});

describe('React Router SDK Example', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createExamplePage', () => {
    it('should create TypeScript example page when tsconfig.json exists', () => {
      const projectDir = '/test/project';

      // Create a more comprehensive mock
      vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
        const pathStr = String(filePath);
        if (pathStr.endsWith('app/routes')) return true;
        if (pathStr.endsWith('tsconfig.json')) return true;
        if (pathStr.endsWith('sentry-example-page.tsx')) return false;
        if (pathStr.endsWith('sentry-example-page.jsx')) return false;
        return false;
      });

      const writeFileSyncSpy = vi
        .mocked(fs.writeFileSync)
        .mockImplementation(() => {
          // Mock implementation
        });

      createExamplePage(projectDir);

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        path.join(projectDir, 'app', 'routes', 'sentry-example-page.tsx'),
        expect.stringContaining('import type { Route } from'),
      );
    });

    it('should create JavaScript example page when tsconfig.json does not exist', () => {
      const projectDir = '/test/project';
      vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
        const pathStr = String(filePath);
        if (pathStr.endsWith('app/routes')) return true;
        if (pathStr.endsWith('tsconfig.json')) return false;
        if (pathStr.endsWith('sentry-example-page.jsx')) return false;
        if (pathStr.endsWith('sentry-example-page.tsx')) return false;
        return false;
      });

      const writeFileSyncSpy = vi
        .mocked(fs.writeFileSync)
        .mockImplementation(() => {
          // Mock implementation
        });

      createExamplePage(projectDir);

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        path.join(projectDir, 'app', 'routes', 'sentry-example-page.jsx'),
        expect.stringContaining('export async function loader()'),
      );
    });

    it('should warn and skip when routes directory does not exist', () => {
      const projectDir = '/test/project';
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('app/routes')) return false;
        return false;
      });

      const writeFileSyncSpy = vi.mocked(fs.writeFileSync);

      createExamplePage(projectDir);

      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it('should warn and skip when example page already exists', () => {
      const projectDir = '/test/project';
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('app/routes')) return true;
        if (pathStr.includes('tsconfig.json')) return true;
        if (pathStr.includes('sentry-example-page.tsx')) return true;
        return false;
      });

      const writeFileSyncSpy = vi.mocked(fs.writeFileSync);

      createExamplePage(projectDir);

      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it('should handle write errors gracefully', () => {
      const projectDir = '/test/project';
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('app/routes')) return true;
        if (pathStr.includes('tsconfig.json')) return true;
        if (pathStr.includes('sentry-example-page.tsx')) return false;
        return false;
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write permission denied');
      });

      expect(() => createExamplePage(projectDir)).not.toThrow();
    });

    it('should use correct file path for TypeScript project', () => {
      const projectDir = '/test/project';
      vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
        const pathStr = String(filePath);
        if (pathStr.endsWith('app/routes')) return true;
        if (pathStr.endsWith('tsconfig.json')) return true;
        if (pathStr.endsWith('sentry-example-page.tsx')) return false;
        if (pathStr.endsWith('sentry-example-page.jsx')) return false;
        return false;
      });

      const writeFileSyncSpy = vi
        .mocked(fs.writeFileSync)
        .mockImplementation(() => {
          // Mock implementation
        });

      createExamplePage(projectDir);

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        '/test/project/app/routes/sentry-example-page.tsx',
        expect.any(String),
      );
    });

    it('should use correct file path for JavaScript project', () => {
      const projectDir = '/test/project';
      vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
        const pathStr = String(filePath);
        if (pathStr.endsWith('app/routes')) return true;
        if (pathStr.endsWith('tsconfig.json')) return false;
        if (pathStr.endsWith('sentry-example-page.jsx')) return false;
        if (pathStr.endsWith('sentry-example-page.tsx')) return false;
        return false;
      });

      const writeFileSyncSpy = vi
        .mocked(fs.writeFileSync)
        .mockImplementation(() => {
          // Mock implementation
        });

      createExamplePage(projectDir);

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        '/test/project/app/routes/sentry-example-page.jsx',
        expect.any(String),
      );
    });
  });
});
