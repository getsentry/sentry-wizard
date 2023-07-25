// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { runSvelteKitWizard } from '../../sveltekit/sveltekit-wizard';

import {
  abort,
  abortIfCancelled,
  getPackageDotJson,
} from '../../utils/clack-utils';
import {
  findInstalledPackageFromList,
  hasPackageInstalled,
} from '../../utils/package-json';

import * as Sentry from '@sentry/node';
import { WizardOptions } from '../../utils/types';

import * as childProcess from 'child_process';

type WizardFunction = (options: WizardOptions) => Promise<void>;

type FrameworkInfo = {
  frameworkName: string;
  frameworkPackage: string;
  troubleshootingDocsLink: string;
  sourcemapsDocsLink: string;
  wizard: WizardFunction;
};

const sdkMap: Record<string, FrameworkInfo> = {
  '@sentry/sveltekit': {
    frameworkName: 'SvelteKit',
    frameworkPackage: '@sveltejs/kit',
    sourcemapsDocsLink:
      'https://docs.sentry.io/platforms/javascript/guides/sveltekit/manual-setup/#configure-source-maps-upload',
    troubleshootingDocsLink:
      'https://docs.sentry.io/platforms/javascript/guides/sveltekit/sourcemaps/troubleshooting_js/',
    wizard: runSvelteKitWizard,
  },
  '@sentry/react-native': {
    frameworkName: 'React Native',
    frameworkPackage: 'react-native',
    sourcemapsDocsLink:
      'https://docs.sentry.io/platforms/react-native/sourcemaps/',
    troubleshootingDocsLink:
      'https://docs.sentry.io/platforms/react-native/troubleshooting/#source-maps',
    wizard: runReactNativeWizard,
  },
};

export async function checkIfMoreSuitableWizardExistsAndAskForRedirect(): Promise<
  WizardFunction | undefined
> {
  const sdkName = await checkIfMoreSuitableWizardExists();

  if (!sdkName) {
    return undefined;
  }

  return await askForRedirect(sdkName);
}

async function checkIfMoreSuitableWizardExists(): Promise<string | undefined> {
  Sentry.setTag('using-wrong-wizard', false);

  const packageJson = await getPackageDotJson();

  const installedSdkPackage = findInstalledPackageFromList(
    Object.keys(sdkMap),
    packageJson,
  );

  if (!installedSdkPackage) {
    return undefined;
  }

  const sdkPackageName = installedSdkPackage.name;

  const { frameworkPackage } = sdkMap[sdkPackageName];

  if (!hasPackageInstalled(frameworkPackage, packageJson)) {
    // The user has installed the SDK but not the framework.
    // Maybe it's a false positive and the user is using a different framework.
    // Let's not redirect them to the framework wizard in that case.
    return undefined;
  }

  Sentry.setTag('using-wrong-wizard', true);

  return sdkPackageName;
}

async function askForRedirect(
  sdkName: string,
): Promise<WizardFunction | undefined> {
  const { frameworkName, sourcemapsDocsLink, troubleshootingDocsLink, wizard } =
    sdkMap[sdkName];

  clack.log.warn(
    `${chalk.yellow(
      `It seems like you're using this wizard in a ${frameworkName} project.`,
    )}

We recommend using our dedicated ${frameworkName} wizard instead of this wizard.
The ${frameworkName} wizard will set up our ${sdkName} SDK and also configure uploading source maps for you.

If you already tried the ${frameworkName} wizard and it didn't work for you, check out the following guides:

Manual source maps configuration for ${frameworkName}:
${sourcemapsDocsLink}

Troubleshooting Source Maps:
${troubleshootingDocsLink}
`,
  );

  const nextStep: 'redirect' | 'continue' | 'stop' = await abortIfCancelled(
    clack.select({
      message: `Do you want to run the ${frameworkName} wizard now?`,
      options: [
        {
          label: 'Yes',
          value: 'redirect',
          hint: `${chalk.green('Recommended')}`,
        },
        {
          label: 'No, continue with this wizard',
          value: 'continue',
        },
        {
          label: "No, I'll check out the guides ",
          value: 'stop',
          hint: 'Exit this wizard',
        },
      ],
    }),
  );

  Sentry.setTag('wrong-wizard-decision', nextStep);

  switch (nextStep) {
    case 'redirect':
      return wizard;
    case 'stop':
      await abort('Exiting Wizard', 0);
      break;
    default:
      return undefined;
  }
}

function runReactNativeWizard(): Promise<void> {
  const [runner, ...wizardArgs] = [...process.argv];
  wizardArgs.push('--integration', 'reactNative');

  try {
    childProcess.spawnSync(runner, wizardArgs, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
  } catch {
    return Promise.reject();
  }

  return Promise.resolve();
}
