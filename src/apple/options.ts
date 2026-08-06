import { WizardOptions } from '../utils/types';

export interface AppleWizardOptions extends WizardOptions {
  projectDir: string | undefined;
}

export interface AppleSnapshotsWizardOptions extends AppleWizardOptions {
  appTarget?: string;
  hostedTestTarget?: string;
  nonInteractive: boolean;
}
