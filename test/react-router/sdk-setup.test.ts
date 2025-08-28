import * as childProcess from 'child_process';
import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs');
vi.mock('child_process');
vi.mock('@clack/prompts', () => {
  return {
    default: {
      log: {
        warn: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
      },
    },
  };
});

import {
  isReactRouterV7,
  runReactRouterReveal,
} from '../../src/react-router/sdk-setup';

describe('React Router SDK Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isReactRouterV7', () => {
    it('should return true for React Router v7', () => {
      const packageJson = {
        dependencies: {
          '@react-router/dev': '7.0.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(true);
    });

    it('should return false for React Router v6', () => {
      const packageJson = {
        dependencies: {
          '@react-router/dev': '6.28.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(false);
    });

    it('should return false when no React Router dependency', () => {
      const packageJson = {
        dependencies: {
          react: '^18.0.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(false);
    });

    it('should return false when @react-router/dev is not present', () => {
      const packageJson = {
        dependencies: {},
      };

      expect(isReactRouterV7(packageJson)).toBe(false);
    });
  });

  describe('runReactRouterReveal', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
    });

    it('should skip reveal when entry files already exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const execSyncMock = vi.mocked(childProcess.execSync);

      runReactRouterReveal(true);

      expect(execSyncMock).not.toHaveBeenCalled();
    });

    it('should execute reveal command when entry files do not exist for TypeScript', () => {
      const execSyncMock = vi.mocked(childProcess.execSync);
      execSyncMock.mockReturnValue(Buffer.from('reveal output'));

      runReactRouterReveal(true);

      expect(execSyncMock).toHaveBeenCalledWith('npx react-router reveal');
    });

    it('should execute reveal command when entry files do not exist for JavaScript', () => {
      const execSyncMock = vi.mocked(childProcess.execSync);
      execSyncMock.mockReturnValue(Buffer.from('reveal output'));

      runReactRouterReveal(false);

      expect(execSyncMock).toHaveBeenCalledWith('npx react-router reveal');
    });
  });
});
