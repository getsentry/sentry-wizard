import { describe, it, expect } from 'vitest';
import {
  detectSentryVersion,
  calculateMigrationPath,
} from '../../src/upgrade/version-detection.js';

describe('detectSentryVersion', () => {
  it('detects v8 from @sentry/browser dependency', () => {
    const pkg = { dependencies: { '@sentry/browser': '^8.40.0' } };
    expect(detectSentryVersion(pkg).majorVersion).toBe(8);
  });

  it('detects v8 from @sentry/node dependency', () => {
    const pkg = { dependencies: { '@sentry/node': '~8.0.0' } };
    expect(detectSentryVersion(pkg).majorVersion).toBe(8);
  });

  it('detects removed packages (@sentry/utils)', () => {
    const pkg = { dependencies: { '@sentry/utils': '^8.0.0' } };
    const info = detectSentryVersion(pkg);
    expect(info.hasRemovedPackages).toContainEqual({
      name: '@sentry/utils',
      removedInVersion: 9,
    });
  });

  it('detects removed packages (@sentry/types)', () => {
    const pkg = { dependencies: { '@sentry/types': '^8.0.0' } };
    const info = detectSentryVersion(pkg);
    expect(info.hasRemovedPackages).toContainEqual({
      name: '@sentry/types',
      removedInVersion: 9,
    });
  });

  it('returns null for no sentry packages', () => {
    const pkg = { dependencies: { react: '^18.0.0' } };
    expect(detectSentryVersion(pkg).majorVersion).toBeNull();
  });

  it('returns null for empty dependencies', () => {
    const pkg = {};
    expect(detectSentryVersion(pkg).majorVersion).toBeNull();
  });

  it('handles devDependencies', () => {
    const pkg = { devDependencies: { '@sentry/browser': '^8.5.0' } };
    expect(detectSentryVersion(pkg).majorVersion).toBe(8);
  });

  it('handles mixed versions and uses the highest', () => {
    const pkg = {
      dependencies: {
        '@sentry/browser': '^8.0.0',
        '@sentry/node': '^7.0.0',
      },
    };
    const info = detectSentryVersion(pkg);
    expect(info.packages).toHaveLength(2);
    expect(info.majorVersion).toBe(8);
  });
});

describe('calculateMigrationPath', () => {
  it('returns single step for adjacent versions', () => {
    expect(calculateMigrationPath(8, 9)).toEqual(['v8-to-v9']);
  });

  it('returns multi-step for non-adjacent versions', () => {
    expect(calculateMigrationPath(7, 9)).toEqual(['v7-to-v8', 'v8-to-v9']);
  });

  it('returns empty for same version', () => {
    expect(calculateMigrationPath(9, 9)).toEqual([]);
  });

  it('returns empty when from > to', () => {
    expect(calculateMigrationPath(9, 8)).toEqual([]);
  });
});
