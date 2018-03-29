import * as Logging from '../Helper/Logging';
jest.mock('../Helper/Logging'); // We mock logging to not pollute the output
import { Args, Integration, Platform } from '../Constants';
import { run } from '../Setup';

describe('Wizard', () => {
  describe('React Native', () => {
    test('run', () => {
      expect(
        run({
          quiet: true,
          integration: Integration.reactNative,
          platform: [Platform.ios, Platform.android],
          skipConnect: true,
        }),
      ).toBeTruthy();
    });
  });

  describe('Cordova', () => {
    test('run', () => {
      expect(
        run({
          quiet: true,
          integration: Integration.cordova,
          platform: [Platform.ios, Platform.android],
          skipConnect: true,
        }),
      ).toBeTruthy();
    });
  });

  describe('Electron', () => {
    test('run', () => {
      expect(
        run({
          quiet: true,
          integration: Integration.electron,
          skipConnect: true,
        }),
      ).toBeTruthy();
    });
  });

  describe('JavaScript', () => {
    test('run', () => {
      expect(
        run({
          quiet: true,
          integration: Integration.javascript,
          skipConnect: true,
        }),
      ).toBeTruthy();
    });
  });

  describe('Node', () => {
    test('run', () => {
      expect(
        run({
          quiet: true,
          integration: Integration.node,
          skipConnect: true,
        }),
      ).toBeTruthy();
    });
  });
});
