import {
  addSentryInitWithSdkImport,
  checkAndWrapRootComponent,
  doesJsCodeIncludeSdkSentryImport,
  SentryWrapError,
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

      expect(checkAndWrapRootComponent(input)).toBe(expectedOutput);
    });

    it('wraps a wrapped root app component', () => {
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

export default AnotheWrapper.wrap(App);`;

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

export default Sentry.wrap(AnotheWrapper.wrap(App));`;

      expect(checkAndWrapRootComponent(input)).toBe(expectedOutput);
    });

    it('wraps the root app named function', () => {
      const input = `import * as Sentry from '@sentry/react-native';

export default function RootLayout() {
  return (
    <View>
      Test App
    </View>
  );
}`;

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(function RootLayout() {
  return (
    <View>
      Test App
    </View>
  );
});`;

      expect(checkAndWrapRootComponent(input)).toBe(expectedOutput);
    });

    it('wraps the root app anonymous function', () => {
      const input = `import * as Sentry from '@sentry/react-native';

export default () => {
  return (
    <View>
      Test App
    </View>
  );
}`;

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(() => {
  return (
    <View>
      Test App
    </View>
  );
});`;

      expect(checkAndWrapRootComponent(input)).toBe(expectedOutput);
    });

    it('wraps the complex root function', () => {
      // This is the default export for a new Expo 52 project
      const input = `import * as Sentry from '@sentry/react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}`;

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
});`;

      expect(checkAndWrapRootComponent(input)).toBe(expectedOutput);
    });

    it('wraps the root app anonymous complex function', () => {
      const input = `import * as Sentry from '@sentry/react-native';

export default () => {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}`;

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(() => {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
});`;

      expect(checkAndWrapRootComponent(input)).toBe(expectedOutput);
    });

    it('does not wrap the root app component if not found', () => {
      const input = `import * as Sentry from '@sentry/react-native';
      export App;`;
      expect(checkAndWrapRootComponent(input)).toBe(SentryWrapError.NotFound);
    });

    it('does not wrap the root app component if already wrapped', () => {
      const input = `export default Sentry.wrap(RootAppComp);`;
      expect(checkAndWrapRootComponent(input)).toBe(
        SentryWrapError.AlreadyWrapped,
      );
    });

    it('does not wrap the root app component if sentry/react-native is not imported', () => {
      const input = `export default App;`;
      expect(checkAndWrapRootComponent(input)).toBe(SentryWrapError.NoImport);
    });

    it('does not wrap the root app component in an empty file', () => {
      const input = ``;
      expect(checkAndWrapRootComponent(input)).toBe(SentryWrapError.NotFound);
    });
  });
});
