// Key value should be the same here
export enum ProjectType {
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

export function getProjectDescription(type: string) {
  switch (type) {
    case ProjectType.reactNative:
      return 'React Native';
    case ProjectType.cordova:
      return 'Cordova';
    case ProjectType.node:
      return 'Generic node project';
    default:
      return 'Generic javascript project';
  }
}

export function getProjectTypeChoices() {
  const result = [];
  for (const type in ProjectType) {
    if (ProjectType.hasOwnProperty(type)) {
      result.push({
        name: getProjectDescription(type),
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
  type: ProjectType;
  platform: Platform;
}

export enum WizardProperties {}
