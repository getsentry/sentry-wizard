/** Key value should be the same here */
export enum Integration {
  reactNative = 'reactNative',
  flutter = 'flutter',
  ios = 'ios',
  android = 'android',
  cordova = 'cordova',
  angular = 'angular',
  electron = 'electron',
  nextjs = 'nextjs',
  nuxt = 'nuxt',
  remix = 'remix',
  reactRouter = 'reactRouter',
  sveltekit = 'sveltekit',
  sourcemaps = 'sourcemaps',
}

/** Key value should be the same here */
export enum Platform {
  ios = 'ios',
  android = 'android',
}

export function getPlatformChoices(): Array<{
  checked: boolean;
  name: string;
  value: string;
}> {
  return Object.keys(Platform).map((platform) => ({
    checked: true,
    name: getPlatformDescription(platform),
    value: platform,
  }));
}

export function getPlatformDescription(type: string): string {
  switch (type) {
    case Platform.ios:
      return 'iOS';
    default:
      return 'Android';
  }
}

export function getIntegrationDescription(type: string): string {
  switch (type) {
    case Integration.android:
      return 'Android';
    case Integration.reactNative:
      return 'React Native';
    case Integration.flutter:
      return 'Flutter';
    case Integration.cordova:
      return 'Cordova';
    case Integration.electron:
      return 'Electron';
    case Integration.nextjs:
      return 'Next.js';
    case Integration.remix:
      return 'Remix';
    case Integration.reactRouter:
      return 'React Router (framework)';
    case Integration.sveltekit:
      return 'SvelteKit';
    case Integration.sourcemaps:
      return 'Configure Source Maps Upload';
    case Integration.ios:
      return 'iOS';
    default:
      return 'React Native';
  }
}

export function mapIntegrationToPlatform(type: string): string | undefined {
  switch (type) {
    case Integration.android:
      return 'android';
    case Integration.reactNative:
      return 'react-native';
    case Integration.flutter:
      return 'flutter';
    case Integration.cordova:
      return 'cordova';
    case Integration.angular:
      return 'javascript-angular';
    case Integration.electron:
      return 'javascript-electron';
    case Integration.nextjs:
      return 'javascript-nextjs';
    case Integration.remix:
      return 'javascript-remix';
    case Integration.reactRouter:
      return 'javascript-react-router';
    case Integration.sveltekit:
      return 'javascript-sveltekit';
    case Integration.sourcemaps:
      return undefined;
    case Integration.ios:
      return 'iOS';
    default:
      throw new Error(`Unknown integration ${type}`);
  }
}

type IntegrationChoice = {
  name: string;
  value: string;
};

export function getIntegrationChoices(): IntegrationChoice[] {
  return Object.keys(Integration).map((type: string) => ({
    name: getIntegrationDescription(type),
    value: type,
  }));
}

export interface Args {
  url: string;
  debug: boolean;
  uninstall: boolean;
  integration: Integration;
  platform: Platform[];
  skipConnect: boolean;
  quiet: boolean;
  signup: boolean;
  promoCode?: string;
  disableTelemetry?: boolean;
  comingFrom?: string;
  ignoreGitChanges?: boolean;
  xcodeProjectDir?: string;
}

export const DEFAULT_URL = 'https://sentry.io/';
