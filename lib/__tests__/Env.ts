import { describe, expect, test } from 'vitest';
import { readEnvironment } from '../Helper/Env';

describe('read-env', () => {
  test('transform', () => {
    process.env.SENTRY_WIZARD_DEBUG = 'true';
    process.env.SENTRY_WIZARD_UNINSTALL = 'false';
    process.env.SENTRY_WIZARD_SKIP_CONNECT = 'true';
    process.env.SENTRY_WIZARD_QUIET = 'true';
    process.env.SENTRY_WIZARD_INTEGRATION = 'reactNative,electron';
    process.env.SENTRY_WIZARD_PLATFORM = 'ios,android';
    process.env.SENTRY_WIZARD_URL = 'https://sentry.io';

    expect(readEnvironment()).toEqual({
      debug: true,
      integration: 'reactNative,electron',
      platform: 'ios,android',
      quiet: true,
      skipConnect: true,
      uninstall: false,
      url: 'https://sentry.io',
    });
  });
});
