import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _mergeHooksFile } from '../../../src/sveltekit/sdk-setup/setup';

vi.mock('@clack/prompts', () => ({
  default: {
    log: {
      success: vi.fn(),
    },
  },
}));

describe('_mergeHooksFile', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('prepends Cloudflare initialization when merging server hooks', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-wizard-'));
    const hooksFile = path.join(tempDir, 'hooks.server.ts');
    fs.writeFileSync(
      hooksFile,
      'export const handle = ({ event, resolve }) => resolve(event);\n',
    );

    await _mergeHooksFile(
      hooksFile,
      'server',
      'https://sentry.io/123',
      {
        performance: true,
        replay: false,
        logs: true,
      },
      false,
      true,
    );

    const result = fs.readFileSync(hooksFile, 'utf8');
    const cloudflareInitIndex = result.indexOf(
      'Sentry.initCloudflareSentryHandle({',
    );
    const sentryHandleIndex = result.indexOf('Sentry.sentryHandle()');
    const userHandleIndex = result.indexOf(
      '({ event, resolve }) => resolve(event)',
    );

    expect(result).toMatch(
      /import \* as Sentry from ["']@sentry\/sveltekit["'];/,
    );
    expect(result).toMatch(/dsn: ["']https:\/\/sentry\.io\/123["']/);
    expect(result).toContain('tracesSampleRate: 1');
    expect(result).toContain('enableLogs: true');
    expect(result).toContain('dataCollection: {');
    expect(cloudflareInitIndex).toBeGreaterThan(-1);
    expect(sentryHandleIndex).toBeGreaterThan(cloudflareInitIndex);
    expect(userHandleIndex).toBeGreaterThan(sentryHandleIndex);
    expect(result).not.toContain('Sentry.init({');
  });
});
