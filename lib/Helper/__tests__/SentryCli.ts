/// <reference types="jest" />
import { Answers } from 'inquirer';

import { Args, Integration, Platform } from '../../Constants';
import { SentryCli } from '../SentryCli';

const args: Args = {
  debug: false,
  integration: Integration.reactNative,
  platform: [Platform.ios],
  quiet: false,
  skipConnect: false,
  uninstall: false,
  url: 'https://localhost:1234',
};

const demoAnswers: Answers = {
  config: {
    auth: {
      token: 'abcd',
    },
    organization: {
      slug: 'test_org',
    },
    project: {
      slug: 'test_proj',
    },
  },
};

describe('SentryCli', () => {
  test('convertAnswersToProperties', () => {
    const resolveFunc = jest.fn().mockReturnValue('node_modules/sentry/cli');
    const sentry = new SentryCli(args);
    sentry.setResolveFunction(resolveFunc);
    const props = sentry.convertAnswersToProperties(demoAnswers);
    expect(props['defaults/url']).toBe('https://localhost:1234');
    expect(props['defaults/org']).toBe('test_org');
    expect(props['defaults/project']).toBe('test_proj');
    expect(props['auth/token']).toBe('abcd');
    expect(props['cli/executable']).toBe('node_modules/sentry/cli');
  });

  test('dump properties', () => {
    const resolveFunc = jest.fn().mockReturnValue('node_modules/sentry/cli');
    const sentry = new SentryCli(args);
    sentry.setResolveFunction(resolveFunc);
    const props = sentry.convertAnswersToProperties(demoAnswers);
    expect(sentry.dumpProperties(props))
      .toBe(`defaults.url=https://localhost:1234
defaults.org=test_org
defaults.project=test_proj
auth.token=abcd
cli.executable=node_modules/sentry/cli
`);
  });

  test('convertAnswersToProperties windows', () => {
    const resolveFunc = jest.fn().mockReturnValue('node_modules\\sentry\\cli');
    const sentry = new SentryCli(args);
    sentry.setResolveFunction(resolveFunc);
    const props = sentry.convertAnswersToProperties(demoAnswers);
    expect(props['defaults/url']).toBe('https://localhost:1234');
    expect(props['defaults/org']).toBe('test_org');
    expect(props['defaults/project']).toBe('test_proj');
    expect(props['auth/token']).toBe('abcd');
    expect(props['cli/executable']).toBe('node_modules\\\\sentry\\\\cli');
  });

  test('dump properties windows', () => {
    const resolveFunc = jest.fn().mockReturnValue('node_modules\\sentry\\cli');
    const sentry = new SentryCli(args);
    sentry.setResolveFunction(resolveFunc);
    const props = sentry.convertAnswersToProperties(demoAnswers);
    expect(sentry.dumpProperties(props))
      .toBe(`defaults.url=https://localhost:1234
defaults.org=test_org
defaults.project=test_proj
auth.token=abcd
cli.executable=node_modules\\\\sentry\\\\cli
`);
  });
});
