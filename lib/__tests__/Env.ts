import { readEnvironment } from '../Helper/Env';

describe('read-env', () => {
  test('transform', () => {
    // @ts-ignore
    process.env.SENTRY_WIZARD_DEBUG = true;
    // @ts-ignore
    process.env.SENTRY_WIZARD_UNINSTALL = false;
    // @ts-ignore
    process.env.SENTRY_WIZARD_SKIP_CONNECT = true;
    // @ts-ignore
    process.env.SENTRY_WIZARD_QUIET = true;
    // @ts-ignore
    process.env.SENTRY_WIZARD_INTEGRATION = ['reactNative', 'electron'];
    // @ts-ignore
    process.env.SENTRY_WIZARD_PLATFORM = ['ios', 'android'];
    // @ts-ignore
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
