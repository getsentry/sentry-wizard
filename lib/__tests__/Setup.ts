jest.mock('../Helper/Logging'); // We mock logging to not pollute the output
import { Integration, Platform } from '../Constants';
import { run } from '../Setup';

describe('Wizard', () => {
  describe('React Native', () => {
    test('run', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
