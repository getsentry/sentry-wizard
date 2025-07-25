import { describe, expect, it } from 'vitest';
import { generateServerInstrumentationFile } from '../../src/remix/sdk-setup';

describe('generateServerInstrumentationFile', () => {
  it('should generate server instrumentation file', () => {
    const result = generateServerInstrumentationFile('https://sentry.io/123', {
      performance: true,
      replay: true,
      logs: true,
    });

    expect(result.instrumentationFileMod.generate().code)
      .toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,
          enableLogs: true
      })"
    `);
  });

  it('should generate server instrumentation file when performance is disabled', () => {
    const result = generateServerInstrumentationFile('https://sentry.io/123', {
      performance: false,
      replay: true,
      logs: false,
    });

    expect(result.instrumentationFileMod.generate().code)
      .toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123"
      })"
    `);
  });

  it('should generate server instrumentation file with only logs enabled', () => {
    const result = generateServerInstrumentationFile('https://sentry.io/123', {
      performance: false,
      replay: false,
      logs: true,
    });

    expect(result.instrumentationFileMod.generate().code)
      .toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",
          enableLogs: true
      })"
    `);
  });

  it('should generate server instrumentation file with performance and logs enabled', () => {
    const result = generateServerInstrumentationFile('https://sentry.io/123', {
      performance: true,
      replay: false,
      logs: true,
    });

    expect(result.instrumentationFileMod.generate().code)
      .toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,
          enableLogs: true
      })"
    `);
  });
});
