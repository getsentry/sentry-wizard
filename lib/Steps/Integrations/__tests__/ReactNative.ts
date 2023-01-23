jest.mock('../../../Helper/Logging.ts'); // We mock logging to not pollute the output
import * as fs from 'fs';
import * as path from 'path';
import { Answers } from 'inquirer';
import * as process from 'process';
import * as rimraf from 'rimraf';

import { Args, Integration, Platform } from '../../../Constants';
import { ReactNative } from '../ReactNative';

const testDir = 'rn-test';
const iosIndexJs = 'index.ios.js';
const appTsx = 'src/App.tsx';
const appBuildGradle = 'android/app/build.gradle';

const dummyJsContent = 'import React from "react";\n';
const dummyAppBuildGradleContent = 'apply plugin: "com.facebook.react"\n\nandroid {\n}\n';

const testArgs = {
  debug: false,
  integration: Integration.reactNative,
  platform: [Platform.ios],
  quiet: true,
  skipConnect: true,
  uninstall: false,
  url: 'https://not.used',
};

const mockIosAnswers: Answers = {
  shouldConfigurePlatforms: { 'ios': true },
  config: {
    dsn: {
      public: 'dns.public.com',
    },
  },
};

const mockAndroidAnswers: Answers = {
  shouldConfigurePlatforms: { 'android': true },
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
    fs.mkdirSync(path.dirname(appTsx), { recursive: true });
    fs.writeFileSync(appTsx, dummyJsContent);
    fs.mkdirSync(path.dirname(appBuildGradle), { recursive: true });
    fs.writeFileSync(appBuildGradle, dummyAppBuildGradleContent);
  });

  afterEach(() => {
    process.chdir(defaultCwd);
    rimraf.sync(testDir);
  });

  test('patches js files', async () => {
    const project = new ReactNative(testArgs as Args);
    await project.emit(mockIosAnswers);

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

  test('patches android app build gradle file', async () => {
    const project = new ReactNative(testArgs as Args);
    await project.emit(mockAndroidAnswers);

    const patchedAppBuildGradle = fs.readFileSync(appBuildGradle, 'utf8');
    const expectedPatch = 'apply plugin: "com.facebook.react"\n\n' +
      'apply from: "../../node_modules/@sentry/react-native/sentry.gradle"\n' +
      'android {\n}\n';
    expect(patchedAppBuildGradle).toEqual(expectedPatch);
  });
});
