export enum ProjectType {
  reactNative = 'react-native',
  browser = 'browser',
  node = 'node'
}

export interface IArgs {
  url: string;
  debug: boolean;
  uninstall: boolean;
  type: ProjectType;
}

export enum WizardProperties {}
