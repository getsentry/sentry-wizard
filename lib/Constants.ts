/** Key value should be the same here */
export enum Integration {
  reactNative = 'reactNative',
  cordova = 'cordova',
  electron = 'electron',
  nextjs = 'nextjs',
}

/** Key value should be the same here */
export enum Platform {
  ios = 'ios',
  android = 'android',
}

export function getPlatformChoices(): any[] {
  return Object.keys(Platform).map((platform: string) => ({
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
    case Integration.reactNative:
      return 'React Native';
    case Integration.cordova:
      return 'Cordova';
    case Integration.electron:
      return 'Electron';
    case Integration.nextjs:
      return 'Next.js';
    default:
      return 'React Native';
  }
}

export function getIntegrationChoices(): any[] {
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
}

export const DEFAULT_URL = 'https://sentry.io/';
