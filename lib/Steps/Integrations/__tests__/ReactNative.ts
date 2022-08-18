jest.mock('../../../Helper/Logging.ts'); // We mock logging to not pollute the output
import * as fs from 'fs';
import { Answers } from 'inquirer';
import * as process from 'process';
import * as rimraf from 'rimraf';

import { Args, Integration, Platform } from '../../../Constants';
import { ReactNative } from '../ReactNative';

const testDir = 'rn-test';
const iosIndexJs = 'index.ios.js';
const appTsx = 'src/App.tsx';

const dummyJsContent = 'import React from "react";\n';

const testArgs = {
  debug: false,
  integration: Integration.reactNative,
  platform: [Platform.ios],
  quiet: true,
  skipConnect: true,
  uninstall: false,
  url: 'https://not.used',
};

const testAnswers: Answers = {
  shouldConfigurePlatforms: { 'ios': true },
  config: {
    dsn: {
      public: 'dns.public.com',
    },
  },
};

describe('ReactNative', () => {

  const defaultCwd = process.cwd();

  beforeEach(() => {
    rimraf.sync(testDir);
    fs.mkdirSync(testDir);
    process.chdir(testDir);
    fs.writeFileSync(iosIndexJs, dummyJsContent);
    fs.mkdirSync('src');
    fs.writeFileSync(appTsx, dummyJsContent);
  });

  afterEach(() => {
    process.chdir(defaultCwd);
    rimraf.sync(testDir);
  });

  test('patches js files', async () => {
    const project = new ReactNative(testArgs as Args);
    await project.emit(testAnswers);

    const patchedIosIndexJs = fs.readFileSync(iosIndexJs, 'utf8');
    const patchedAppTsx = fs.readFileSync(appTsx, 'utf8');
    const expectedPatch = 'import React from "react";\n\n' +
      'import * as Sentry from \'@sentry/react-native\';\n\n' +
      'Sentry.init({ \n' +
      '  dsn: \'dns.public.com\', \n' +
      '});\n\n';
    expect(patchedIosIndexJs).toEqual(expectedPatch);
    expect(patchedAppTsx).toEqual(expectedPatch);
  });
});
