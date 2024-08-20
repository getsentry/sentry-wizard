// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { abortIfCancelled } from './utils/clack-utils';
import { runReactNativeWizard } from './react-native/react-native-wizard';

import { run as legacyRun } from '../lib/Setup';
import { WizardOptions } from './utils/types';
import { runAndroidWizard } from './android/android-wizard';
import { runAppleWizard } from './apple/apple-wizard';
import { runNextjsWizard } from './nextjs/nextjs-wizard';
import { runRemixWizard } from './remix/remix-wizard';
import { runSvelteKitWizard } from './sveltekit/sveltekit-wizard';
import { runSourcemapsWizard } from './sourcemaps/sourcemaps-wizard';
import { readEnvironment } from '../lib/Helper/Env';
import { Platform } from '../lib/Constants';
import { PackageDotJson } from './utils/package-json';
import { runReactNativeCli } from './react-native-cli/react-native-cli';

type WizardIntegration =
  | 'reactNative'
  | 'react-native'
  | 'react-native-cli'
  | 'ios'
  | 'android'
  | 'cordova'
  | 'electron'
  | 'nextjs'
  | 'remix'
  | 'sveltekit'
  | 'sourcemaps';

type Args = {
  integration?: WizardIntegration;

  uninstall: boolean;
  signup: boolean;
  skipConnect: boolean;
  debug: boolean;
  quiet: boolean;
  disableTelemetry: boolean;
  promoCode?: string;

  url?: string;
  platform?: Platform[];
};

export async function run(argv: Args) {
  const finalArgs = {
    ...argv,
    ...readEnvironment(),
  };

  let integration = finalArgs.integration;

  if (!integration) {
    clack.intro(`Sentry Wizard ${tryGetWizardVersion()}`);

    integration = await abortIfCancelled(
      clack.select({
        message: 'What do you want to set up?',
        options: [
          { value: 'react-native', label: 'React Native' },
          { value: 'ios', label: 'iOS' },
          { value: 'android', label: 'Android' },
          { value: 'cordova', label: 'Cordova' },
          { value: 'electron', label: 'Electron' },
          { value: 'nextjs', label: 'Next.js' },
          { value: 'remix', label: 'Remix' },
          { value: 'sveltekit', label: 'SvelteKit' },
          { value: 'sourcemaps', label: 'Configure Source Maps Upload' },
        ],
      }),
    );

    if (!integration) {
      clack.log.error('No integration selected. Exiting.');
      return;
    }

    clack.outro(`Starting ${integration} setup`);
  }

  const wizardOptions: WizardOptions = {
    telemetryEnabled: !argv.disableTelemetry,
    promoCode: argv.promoCode,
    url: argv.url,
  };

  switch (integration) {
    case 'reactNative':
    case 'react-native':
      await runReactNativeWizard({
        ...wizardOptions,
        uninstall: argv.uninstall,
      });
      break;

    case 'ios':
      await runAppleWizard(wizardOptions);
      break;

    case 'android':
      await runAndroidWizard(wizardOptions);
      break;

    case 'nextjs':
      await runNextjsWizard(wizardOptions);
      break;

    case 'remix':
      await runRemixWizard(wizardOptions);
      break;

    case 'sveltekit':
      await runSvelteKitWizard(wizardOptions);
      break;

    case 'sourcemaps':
      await runSourcemapsWizard(wizardOptions);
      break;

    case 'cordova':
      argv.integration = 'cordova';
      void legacyRun(argv);
      break;

    case 'electron':
      argv.integration = 'electron';
      void legacyRun(argv);
      break;

    default:
      clack.log.error(`No setup wizard selected!`);
  }
}

/**
 * TODO: replace with rollup replace whenever we switch to rollup
 */
function tryGetWizardVersion(): string {
  try {
    const wizardPkgJson = require('../package.json') as PackageDotJson;
    return wizardPkgJson.version ?? '';
  } catch {
    return '';
  }
}
