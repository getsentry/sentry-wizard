jest.mock('../Helper/Logging'); // We mock logging to not pollute the output
jest.mock('child_process');
import * as child_process from 'child_process';

import { Integration, Platform } from '../Constants';
import { run } from '../Setup';

const originalExec = child_process.exec;

const restoreExec = (): void => {
  (child_process as any).exec = originalExec;
};

const mockExec = (): void => {
  (child_process.exec as unknown as jest.Mock).mockImplementation(
    (_command, callback) => callback(null, { stdout: '' }),
  );
};

describe('Wizard', () => {
  beforeEach(() => {
    mockExec();
  });

  afterEach(() => {
    restoreExec();
  });

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
