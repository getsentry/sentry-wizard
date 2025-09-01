import { describe, expect, it } from 'vitest';
import { isReactRouterV7 } from '../../src/react-router/sdk-setup';

describe('React Router SDK Setup - Clean Tests', () => {
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

    it('should handle version ranges gracefully', () => {
      const packageJson = {
        dependencies: {
          '@react-router/dev': '^7.1.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(true);
    });

    it('should handle empty package.json', () => {
      const packageJson = {};

      expect(isReactRouterV7(packageJson)).toBe(false);
    });

    it('should check devDependencies if not in dependencies', () => {
      const packageJson = {
        devDependencies: {
          '@react-router/dev': '7.1.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(true);
    });
  });
});
