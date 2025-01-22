// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { runReactNativeWizard } from './react-native/react-native-wizard';
import { abortIfCancelled } from './utils/clack';

import { Integration, type Platform } from '../lib/Constants';
import { readEnvironment } from '../lib/Helper/Env';
import { run as legacyRun } from '../lib/Setup';
import { runAndroidWizard } from './android/android-wizard';
import { runAngularWizard } from './angular/angular-wizard';
import { runAppleWizard } from './apple/apple-wizard';
import { runFlutterWizard } from './flutter/flutter-wizard';
import { runNextjsWizard } from './nextjs/nextjs-wizard';
import { runNuxtWizard } from './nuxt/nuxt-wizard';
import { runRemixWizard } from './remix/remix-wizard';
import { runSourcemapsWizard } from './sourcemaps/sourcemaps-wizard';
import { runSvelteKitWizard } from './sveltekit/sveltekit-wizard';
import { enableDebugLogs } from './utils/debug';
import type { PreselectedProject, WizardOptions } from './utils/types';
import { WIZARD_VERSION } from './version';

type WizardIntegration =
  | 'angular'
  | 'reactNative'
  | 'flutter'
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
  forceInstall?: boolean;
  comingFrom?: string;
  ignoreGitChanges?: boolean;
  xcodeProjectDir?: string;
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

  // Enable debug logs if the user has passed the --debug flag
  if (finalArgs.debug) {
    enableDebugLogs();
  }

  let integration = finalArgs.integration;
  if (!integration) {
    clack.intro(`Sentry Wizard ${WIZARD_VERSION}`);

    integration = await abortIfCancelled(
      clack.select({
        message: 'What do you want to set up?',
        options: [
          { value: 'reactNative', label: 'React Native' },
          { value: 'flutter', label: 'Flutter' },
          { value: 'ios', label: 'iOS' },
          { value: 'angular', label: 'Angular' },
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
    forceInstall: finalArgs.forceInstall,
    comingFrom: finalArgs.comingFrom,
    ignoreGitChanges: finalArgs.ignoreGitChanges,
  };

  switch (integration) {
    case 'reactNative':
      await runReactNativeWizard({
        ...wizardOptions,
        uninstall: finalArgs.uninstall,
      });
      break;

    case 'flutter':
      await runFlutterWizard(wizardOptions);
      break;

    case 'ios':
      await runAppleWizard({
        ...wizardOptions,
        projectDir: finalArgs.xcodeProjectDir,
      });
      break;

    case 'android':
      await runAndroidWizard(wizardOptions);
      break;

    case 'angular':
      await runAngularWizard(wizardOptions);
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
      void legacyRun({
        ...argv,
        url: argv.url ?? '',
        integration: Integration.cordova,
        platform: argv.platform ?? [],
      });
      break;

    case 'electron':
      argv.integration = 'electron';
      void legacyRun({
        ...argv,
        url: argv.url ?? '',
        integration: Integration.electron,
        platform: argv.platform ?? [],
      });
      break;

    default:
      clack.log.error('No setup wizard selected!');
  }
}
