// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { abortIfCancelled } from './utils/clack-utils';
import { runReactNativeWizard } from './react-native/react-native-wizard';

import { run as legacyRun } from '../lib/Setup';
import type { PreselectedProject, WizardOptions } from './utils/types';
import { runFlutterWizzard } from './flutter/flutter-wizzard';
import { runAndroidWizard } from './android/android-wizard';
import { runAppleWizard } from './apple/apple-wizard';
import { runNextjsWizard } from './nextjs/nextjs-wizard';
import { runNuxtWizard } from './nuxt/nuxt-wizard';
import { runRemixWizard } from './remix/remix-wizard';
import { runSvelteKitWizard } from './sveltekit/sveltekit-wizard';
import { runSourcemapsWizard } from './sourcemaps/sourcemaps-wizard';
import { readEnvironment } from '../lib/Helper/Env';
import type { Platform } from '../lib/Constants';
import type { PackageDotJson } from './utils/package-json';

type WizardIntegration =
  | 'flutter'
  | 'reactNative'
  | 'ios'
  | 'android'
  | 'cordova'
  | 'electron'
  | 'nextjs'
  | 'nuxt'
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
  preSelectedProject?: {
    authToken: string;
    selfHosted: boolean;
    dsn: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
    orgId: string;
    orgName: string;
    orgSlug: string;
  };
  url?: string;
  platform?: Platform[];
  org?: string;
  project?: string;
  saas?: boolean;
};

function preSelectedProjectArgsToObject(
  args: Args,
): PreselectedProject | undefined {
  if (!args.preSelectedProject) {
    return undefined;
  }

  return {
    authToken: args.preSelectedProject.authToken,
    selfHosted: args.preSelectedProject.selfHosted,
    project: {
      id: args.preSelectedProject.projectId,
      keys: [
        {
          dsn: {
            public: args.preSelectedProject.dsn,
          },
        },
      ],
      organization: {
        id: args.preSelectedProject.orgId,
        name: args.preSelectedProject.orgName,
        slug: args.preSelectedProject.orgSlug,
      },
      slug: args.preSelectedProject.projectSlug,
    },
  };
}

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
          { value: 'reactNative', label: 'React Native' },
          { value: 'flutter', label: 'Flutter' },
          { value: 'ios', label: 'iOS' },
          { value: 'android', label: 'Android' },
          { value: 'cordova', label: 'Cordova' },
          { value: 'electron', label: 'Electron' },
          { value: 'nextjs', label: 'Next.js' },
          { value: 'nuxt', label: 'Nuxt' },
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
    telemetryEnabled: !finalArgs.disableTelemetry,
    promoCode: finalArgs.promoCode,
    url: finalArgs.url,
    orgSlug: finalArgs.org,
    projectSlug: finalArgs.project,
    saas: finalArgs.saas,
    preSelectedProject: preSelectedProjectArgsToObject(finalArgs),
  };

  switch (integration) {
    case 'flutter':
      await runFlutterWizzard(wizardOptions);
      break;
    case 'reactNative':
      await runReactNativeWizard({
        ...wizardOptions,
        uninstall: finalArgs.uninstall,
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

    case 'nuxt':
      await runNuxtWizard(wizardOptions);
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
      clack.log.error('No setup wizard selected!');
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
