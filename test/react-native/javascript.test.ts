import {
  addSentryInitWithSdkImport,
  doesJsCodeIncludeSdkSentryImport,
} from '../../src/react-native/javascript';

describe('react-native javascript', () => {
  describe('addSentryInitWithSdkImport', () => {
    it('adds sdk import and sentry init under last import in the file', () => {
      const input = `import * as React from 'react';

const test = 'test';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default App;`;

      const expectedOutput = `import * as React from 'react';

const test = 'test';

import { View } from 'react-native';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'dsn',
});

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default App;`;

      expect(addSentryInitWithSdkImport(input, { dsn: 'dsn' })).toBe(
        expectedOutput,
      );
    });

    it('does not add sdk import and sentry init in the file without imports', () => {
      const input = `export const test = 'test';`;
      expect(addSentryInitWithSdkImport(input, { dsn: 'dsn' })).toBe(input);
    });

    it('does not add sdk import and sentry init in the empty file', () => {
      const input = '';
      expect(addSentryInitWithSdkImport(input, { dsn: 'dsn' })).toBe(input);
    });
  });

  describe('doesJsCodeIncludeSdkSentryImport', () => {
    it('returns true if code has sdk import', () => {
      const input = `import * as React from 'react';

const test = 'test';

import { View } from 'react-native';
import * as Sentry from '@sentry/react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default App;`;

      expect(
        doesJsCodeIncludeSdkSentryImport(input, {
          sdkPackageName: '@sentry/react-native',
        }),
      ).toBe(true);
    });

    it('returns true if code has sdk require', () => {
      const input = `import * as React from 'react';

const test = 'test';

import { View } from 'react-native';
const Sentry = require('@sentry/react-native');

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default App;`;

      expect(
        doesJsCodeIncludeSdkSentryImport(input, {
          sdkPackageName: '@sentry/react-native',
        }),
      ).toBe(true);
    });

    it('returns false if code does not have sdk import', () => {
      const input = `export const test = 'test';`;
      expect(
        doesJsCodeIncludeSdkSentryImport(input, {
          sdkPackageName: '@sentry/react-native',
        }),
      ).toBe(false);
    });

    it('returns false for empty file', () => {
      const input = '';
      expect(
        doesJsCodeIncludeSdkSentryImport(input, {
          sdkPackageName: '@sentry/react-native',
        }),
      ).toBe(false);
    });
  });
});
