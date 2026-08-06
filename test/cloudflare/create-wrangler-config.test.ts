import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { createWranglerConfig } from '../../src/cloudflare/wrangler/create-wrangler-config';
import path from 'node:path';

const { clackMocks } = vi.hoisted(() => {
  const info = vi.fn();
  const success = vi.fn();

  return {
    clackMocks: {
      info,
      success,
    },
  };
});

vi.mock('@clack/prompts', () => {
  return {
    __esModule: true,
    default: {
      log: {
        info: clackMocks.info,
        success: clackMocks.success,
      },
    },
  };
});

describe('createWranglerConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a wrangler.jsonc file with basic configuration', () => {
    const writeFileSyncMock = vi.spyOn(fs, 'writeFileSync');
    const joinMock = vi.spyOn(path, 'join');

    joinMock.mockReturnValue('/project/wrangler.jsonc');
    writeFileSyncMock.mockImplementation(() => undefined);

    createWranglerConfig();

    expect(writeFileSyncMock).toHaveBeenCalledWith(
      '/project/wrangler.jsonc',
      expect.stringContaining('"name": "my-worker"'),
      'utf-8',
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      '/project/wrangler.jsonc',
      expect.stringContaining('"main": "src/index.ts"'),
      'utf-8',
    );
  });
});
