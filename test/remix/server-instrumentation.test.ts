import { generateServerInstrumentationFile } from '../../src/remix/sdk-setup';

describe('generateServerInstrumentationFile', () => {
  it('should generate server instrumentation file', () => {
    const result = generateServerInstrumentationFile('https://sentry.io/123', {
      performance: true,
      replay: true,
    });

    expect(result.instrumentationFileMod.generate().code)
      .toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,
          autoInstrumentRemix: true
      })"
    `);
  });

  it('should generate server instrumentation file when performance is disabled', () => {
    const result = generateServerInstrumentationFile('https://sentry.io/123', {
      performance: false,
      replay: true,
    });

    expect(result.instrumentationFileMod.generate().code)
      .toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",
          autoInstrumentRemix: true
      })"
    `);
  });
});
