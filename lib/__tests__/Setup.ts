import * as Logging from '../Helper/Logging';
jest.mock('../Helper/Logging'); // We mock logging to not pollute the output
import { Integration, Platform } from '../Constants';
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
});
