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

type Args = {
  integration?:
    | 'reactNative'
    | 'ios'
    | 'android'
    | 'cordova'
    | 'electron'
    | 'nextjs'
    | 'remix'
    | 'sveltekit'
    | 'sourcemaps';

  url?: string;

  uninstall: boolean;
  'disable-telemetry': boolean;
  'promo-code'?: string;
};

export async function run(argv: Args) {
  let integration = argv.integration;
  if (!integration) {
    clack.intro('Sentry Wizard');

    integration = await abortIfCancelled(
      clack.select({
        message: 'What do you want to set up?',
        options: [
          { value: 'reactNative', label: 'React Native' },
          { value: 'ios', label: 'iOS' },
          { value: 'android', label: 'Android' },
          { value: 'cordova', label: 'Cordova' },
          { value: 'electron', label: 'Electron' },
          { value: 'nextjs', label: 'NextJS' },
          { value: 'remix', label: 'Remix' },
          { value: 'sveltekit', label: 'SvelteKit' },
          { value: 'sourcemaps', label: 'Configure Source Maps Upload' },
        ],
      }),
    );

    clack.outro(`Starting ${integration} setup...`);
  }

  const wizardOptions: WizardOptions = {
    telemetryEnabled: !argv['disable-telemetry'],
    promoCode: argv['promo-code'],
    url: argv.url,
  };

  switch (integration) {
    case 'reactNative':
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
      clack.log.error(`No setup wizard for ${integration}`);
  }
}
