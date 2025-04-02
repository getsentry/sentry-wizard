import {
  addSentryInitWithSdkImport,
  checkAndWrapRootComponent,
  doesContainSentryWrap,
  doesJsCodeIncludeSdkSentryImport,
  SentryWrapResult,
} from '../../src/react-native/javascript';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';
import * as t from '@babel/types';

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

    it('adds sdk import and sentry init under last import in the file and enables session replay', () => {
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

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

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

      expect(
        addSentryInitWithSdkImport(input, {
          dsn: 'dsn',
          enableSessionReplay: true,
        }),
      ).toBe(expectedOutput);
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
      const mod = parseModule(`import * as React from 'react';
import * as Sentry from '@sentry/react-native';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default App;`);

      const expectedOutput = `import * as React from 'react';
import * as Sentry from '@sentry/react-native';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default Sentry.wrap(App);`;

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a wrapped root app component', () => {
      const mod = parseModule(`import * as React from 'react';
import * as Sentry from '@sentry/react-native';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default AnotheWrapper.wrap(App);`);

      const expectedOutput = `import * as React from 'react';
import * as Sentry from '@sentry/react-native';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default Sentry.wrap(AnotheWrapper.wrap(App));`;

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a root app named function', () => {
      const mod = parseModule(`import * as Sentry from '@sentry/react-native';

export default function RootLayout() {
  return (
    <View>
      Test App
    </View>
  );
}`);

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(function RootLayout() {
  return (
    <View>
      Test App
    </View>
  );
});`;

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a wrapped root app named function', () => {
      const mod = parseModule(`import * as Sentry from '@sentry/react-native';

export default Another.wrapper(function RootLayout() {
  return (
    <View>
      Test App
    </View>
  );
});`);

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(Another.wrapper(function RootLayout() {
  return (
    <View>
      Test App
    </View>
  );
}));`;

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a root app anonymous function', () => {
      const mod = parseModule(`import * as Sentry from '@sentry/react-native';

export default () => {
  return (
    <View>
      Test App
    </View>
  );
}`);

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(() => {
  return (
    <View>
      Test App
    </View>
  );
});`;

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a wrapped root app anonymous function', () => {
      const mod = parseModule(`import * as Sentry from '@sentry/react-native';

export default Another.wrap(() => {
  return (
    <View>
      Test App
    </View>
  );
});`);

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(Another.wrap(() => {
  return (
    <View>
      Test App
    </View>
  );
}));`;

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a complex root function', () => {
      // This is the default export for a new Expo 52 project
      const mod =
        parseModule(`import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://sentry.io/123',

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

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
}
`);

      const expectedOutput = `import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://sentry.io/123',

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

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

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a root app anonymous complex function', () => {
      const mod = parseModule(`import * as Sentry from '@sentry/react-native';

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
}`);

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

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('wraps a default class export', () => {
      const mod = parseModule(`import * as Sentry from '@sentry/react-native';

export default class RootLayout extends React.Component {
  render() {
    return (
      <View>
        Test App
      </View>
    );
  }
}`);

      const expectedOutput = `import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(class RootLayout extends React.Component {
  render() {
    return (
      <View>
        Test App
      </View>
    );
  }
});`;

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.Success);
      expect(generateCode(mod.$ast).code).toBe(expectedOutput);
    });

    it('does not wrap a root app component if not found', () => {
      const input = `import * as React from 'react';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export { App };`;
      const mod = parseModule(input);

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.NotFound);
      expect(generateCode(mod.$ast).code).toBe(input);
    });

    it('does not wrap a root app component if already wrapped', () => {
      const input = `import * as React from 'react';
import * as Sentry from '@sentry/react-native';

import { View } from 'react-native';

const App = () => {
  return (
    <View>
      Test App
    </View>
  );
};

export default Sentry.wrap(App);`;
      const mod = parseModule(input);

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.AlreadyWrapped);
      expect(generateCode(mod.$ast).code).toBe(input);
    });

    it('does not wrap the root app component in an empty file', () => {
      const mod = parseModule(``);

      const result = checkAndWrapRootComponent(mod);

      expect(result).toBe(SentryWrapResult.NotFound);
      expect(generateCode(mod.$ast).code).toBe(``);
    });
  });

  it('does detect Sentry.wrap if exists', () => {
    const mod = parseModule(`export default Sentry.wrap(App);`);

    const result = doesContainSentryWrap(mod.$ast as t.Program);

    expect(result).toBeTruthy();
  });

  it('does not detect Sentry.wrap if not present', () => {
    const mod = parseModule(`export default App;`);

    const result = doesContainSentryWrap(mod.$ast as t.Program);

    expect(result).toBeFalsy();
  });
});
