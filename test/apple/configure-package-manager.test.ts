import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { configurePackageManager } from '../../src/apple/configure-package-manager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('should always use SPM', () => {
    // -- Act --
    const result = configurePackageManager({ projectDir });

    // -- Assert --
    expect(result.shouldUseSPM).toBe(true);
    expect(Sentry.setTag).toHaveBeenCalledWith('package-manager', 'SPM');
  });
});
