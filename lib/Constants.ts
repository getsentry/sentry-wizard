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
  const result = [];
  for (const platform in Platform) {
    if (Platform.hasOwnProperty(platform)) {
      result.push({
        checked: true,
        name: getPlatformDescription(platform),
        value: platform,
      });
    }
  }
  return result;
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
  const result = [];
  for (const type in Integration) {
    if (Integration.hasOwnProperty(type)) {
      result.push({
        name: getIntegrationDescription(type),
        value: type,
      });
    }
  }
  return result;
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
