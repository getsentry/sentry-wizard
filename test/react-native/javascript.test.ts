import {
  addSentryInitWithSdkImport,
  checkAndWrapRootComponent,
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

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
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

  describe('addSentryWrap', () => {
    it('wraps the root app component', () => {
      const input = `import * as React from 'react';
import * as Sentry from '@sentry/react-native';

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
import * as Sentry from '@sentry/react-native';

const test = 'test';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default Sentry.wrap(App);`;

      expect(checkAndWrapRootComponent(input, '')).toBe(expectedOutput);
    });

    it('does not wrap the root app component if not found', () => {
      const input = `import * as Sentry from '@sentry/react-native';
      export App;`;
      expect(checkAndWrapRootComponent(input, '')).toBeNull();
    });

    it('does not wrap the root app component if already wrapped', () => {
      const input = `export default Sentry.wrap(RootAppComp);`;
      expect(checkAndWrapRootComponent(input, '')).toBeUndefined();
    });

    it('does not wrap the root app component if sentry/react-native is not imported', () => {
      const input = `export default App;`;
      expect(checkAndWrapRootComponent(input, '')).toBeNull();
    });

    it('does not wrap the root app component in an empty file', () => {
      const input = ``;
      expect(checkAndWrapRootComponent(input, '')).toBeNull();
    });
  });
});
