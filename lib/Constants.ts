// Key value should be the same here
export enum Integration {
  reactNative = 'reactNative',
  javascript = 'javascript',
  node = 'node',
  cordova = 'cordova',
}

export enum Platform {
  ios = 'ios',
  android = 'android',
}

export function getPlatformChoices() {
  return Object.keys(Platform).map((platform: string) => ({
    checked: true,
    name: getPlatformDescription(platform),
    value: platform,
  }));
}

export function getPlatformDescription(type: string) {
  switch (type) {
    case Platform.ios:
      return 'iOS';
    default:
      return 'Android';
  }
}

export function getIntegrationDescription(type: string) {
  switch (type) {
    case Integration.reactNative:
      return 'React Native';
    case Integration.cordova:
      return 'Cordova';
    case Integration.node:
      return 'Generic node project';
    default:
      return 'Generic javascript project';
  }
}

export function getIntegrationChoices() {
  return Object.keys(Integration).map((type: string) => ({
    name: getIntegrationDescription(type),
    value: type,
  }));
}

export interface IArgs {
  url: string;
  debug: boolean;
  uninstall: boolean;
  integration: Integration;
  platform: Platform;
  skipConnect: boolean;
  quiet: boolean;
}

export enum WizardProperties {}
