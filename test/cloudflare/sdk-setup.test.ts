import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSentryInitFile } from '../../src/cloudflare/sdk-setup';
import { defaultEntryPoint } from '../../src/cloudflare/wrangler/get-entry-point-from-wrangler-config';
import * as templates from '../../src/cloudflare/templates';
import * as wrapWorker from '../../src/cloudflare/wrap-worker';

const { clackMocks } = vi.hoisted(() => {
  const info = vi.fn();
  const warn = vi.fn();
  const success = vi.fn();
  const step = vi.fn();
  const note = vi.fn();

  return {
    clackMocks: {
      info,
      warn,
      success,
      step,
      note,
    },
  };
});

vi.mock('@clack/prompts', () => ({
  __esModule: true,
  default: {
    log: {
      info: clackMocks.info,
      warn: clackMocks.warn,
      success: clackMocks.success,
      step: clackMocks.step,
    },
    note: clackMocks.note,
  },
}));

const { getEntryPointFromWranglerConfigMock } = vi.hoisted(() => ({
  getEntryPointFromWranglerConfigMock: vi.fn(),
}));

vi.mock(
  '../../src/cloudflare/wrangler/get-entry-point-from-wrangler-config',
  () => ({
    getEntryPointFromWranglerConfig: getEntryPointFromWranglerConfigMock,
    defaultEntryPoint: 'src/index.ts',
  }),
);

describe('createSentryInitFile', () => {
  let tmpDir: string;
  const testDsn = 'https://example@sentry.io/123';
  const testFeatures = {
    performance: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getEntryPointFromWranglerConfigMock.mockReset();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-setup-test-'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }

    vi.restoreAllMocks();
  });

  it('creates a new default entry point file and wraps it with Sentry', async () => {
    await createSentryInitFile(testDsn, testFeatures, false);

    const content = fs.readFileSync(path.join(tmpDir, 'src/index.ts'), 'utf-8');

    expect(clackMocks.info).toHaveBeenCalledWith(
      'No entry point found in wrangler config, creating a new one.',
    );
    expect(content).toContain('export default Sentry.withSentry(');
    expect(content).toContain(testDsn);
    expect(clackMocks.success).toHaveBeenCalledWith('Created src/index.ts.');
  });

  it('does not overwrite an existing default entry point file', async () => {
    const entryPoint = path.join(tmpDir, defaultEntryPoint);
    fs.mkdirSync(path.dirname(entryPoint), { recursive: true });
    fs.writeFileSync(
      entryPoint,
      'export default { async fetch() { return new Response("mine"); } };\n',
    );

    await expect(
      createSentryInitFile(testDsn, testFeatures, false),
    ).resolves.toBe(true);

    const content = fs.readFileSync(entryPoint, 'utf-8');
    expect(content).toContain('new Response("mine")');
    expect(content).toContain('Sentry.withSentry(');
  });

  describe('when entry point is found in wrangler config', () => {
    describe('and the entry point file exists', () => {
      beforeEach(async () => {
        await createSentryInitFile(testDsn, testFeatures, false);
        getEntryPointFromWranglerConfigMock.mockReturnValue(defaultEntryPoint);
      });

      it('wraps the worker with Sentry when wrapping succeeds', async () => {
        const wrapWorkerWithSentrySpy = vi
          .spyOn(wrapWorker, 'wrapWorkerWithSentry')
          .mockResolvedValue(undefined);

        await createSentryInitFile(testDsn, testFeatures, false);

        expect(wrapWorkerWithSentrySpy).toHaveBeenCalledWith(
          path.join(tmpDir, defaultEntryPoint),
          testDsn,
          testFeatures,
          false,
        );
      });

      it('handles wrapping failure gracefully', async () => {
        vi.spyOn(wrapWorker, 'wrapWorkerWithSentry').mockRejectedValue(
          new Error('Wrapping failed'),
        );

        await expect(
          createSentryInitFile(testDsn, testFeatures, false),
        ).resolves.toBe(false);

        expect(clackMocks.warn).toHaveBeenCalledWith(
          'Failed to wrap worker automatically.',
        );
        expect(clackMocks.step).toHaveBeenCalledWith(
          'Please wrap your handler with Sentry initialization:',
        );
        expect(clackMocks.note).toHaveBeenCalledWith(
          expect.stringContaining('import * as Sentry'),
        );
      });

      it('shows template with correct DSN when wrapping fails', async () => {
        vi.spyOn(wrapWorker, 'wrapWorkerWithSentry').mockRejectedValue(
          new Error('Failed'),
        );
        const getCloudflareWorkerTemplateSpy = vi
          .spyOn(templates, 'getCloudflareWorkerTemplate')
          .mockReturnValue('template with dsn');

        await createSentryInitFile(testDsn, testFeatures, false);

        expect(getCloudflareWorkerTemplateSpy).toHaveBeenCalledWith(
          testDsn,
          testFeatures,
          false,
        );
        expect(clackMocks.note).toHaveBeenCalledWith('template with dsn');
      });

      it('passes performance feature flag correctly', async () => {
        const wrapWorkerWithSentrySpy = vi
          .spyOn(wrapWorker, 'wrapWorkerWithSentry')
          .mockResolvedValue(undefined);

        await createSentryInitFile(testDsn, { performance: false }, false);

        expect(wrapWorkerWithSentrySpy).toHaveBeenCalledWith(
          path.join(tmpDir, defaultEntryPoint),
          testDsn,
          { performance: false },
          false,
        );
      });

      it('passes performance feature flag when enabled', async () => {
        const wrapWorkerWithSentrySpy = vi
          .spyOn(wrapWorker, 'wrapWorkerWithSentry')
          .mockResolvedValue(undefined);

        await createSentryInitFile(testDsn, { performance: true }, false);

        expect(wrapWorkerWithSentrySpy).toHaveBeenCalledWith(
          path.join(tmpDir, defaultEntryPoint),
          testDsn,
          { performance: true },
          false,
        );
      });

      it('passes reduceDataCollection through to the worker wrapper', async () => {
        const wrapWorkerWithSentrySpy = vi
          .spyOn(wrapWorker, 'wrapWorkerWithSentry')
          .mockResolvedValue(undefined);

        await createSentryInitFile(testDsn, testFeatures, true);

        expect(wrapWorkerWithSentrySpy).toHaveBeenCalledWith(
          path.join(tmpDir, defaultEntryPoint),
          testDsn,
          testFeatures,
          true,
        );
      });
    });

    describe('and the entry point file does not exist', () => {
      beforeEach(() => {
        getEntryPointFromWranglerConfigMock.mockReturnValue('nope.ts');
      });

      it('warns and shows manual instructions', async () => {
        await expect(
          createSentryInitFile(testDsn, testFeatures, false),
        ).resolves.toBe(false);

        expect(clackMocks.warn).toHaveBeenCalledWith(
          'Entry point nope.ts from your wrangler config does not exist.',
        );
        expect(clackMocks.note).toHaveBeenCalledWith(
          expect.stringContaining(testDsn),
        );
        expect(fs.existsSync(path.join(tmpDir, 'nope.ts'))).toBe(false);
      });

      it('does not call wrapWorkerWithSentry', async () => {
        const wrapWorkerWithSentrySpy = vi
          .spyOn(wrapWorker, 'wrapWorkerWithSentry')
          .mockResolvedValue(undefined);

        await createSentryInitFile(testDsn, testFeatures, false);

        expect(wrapWorkerWithSentrySpy).not.toHaveBeenCalled();
      });
    });
  });
});
