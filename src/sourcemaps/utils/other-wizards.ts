// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { runNextjsWizard } from '../../nextjs/nextjs-wizard';
import { runSvelteKitWizard } from '../../sveltekit/sveltekit-wizard';

import { abortIfCancelled, getPackageDotJson } from '../../utils/clack-utils';
import {
  findPackageFromList,
  hasPackageInstalled,
} from '../../utils/package-json';

import * as Sentry from '@sentry/node';
import { abort } from 'process';
import { WizardOptions } from '../../utils/types';

type WizardFunction = (options: WizardOptions) => Promise<void>;

type FrameworkInfo = {
  frameworkName: string;
  frameworkSlug: string;
  frameworkPackage: string;
  sourcemapsDocsLink: string;
  wizard: WizardFunction;
};

const sdkMap: Record<string, FrameworkInfo> = {
  '@sentry/nextjs': {
    frameworkName: 'Next.js',
    frameworkSlug: 'nextjs',
    frameworkPackage: 'next',
    sourcemapsDocsLink:
      'https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-source-maps',
    wizard: runNextjsWizard,
  },
  '@sentry/sveltekit': {
    frameworkName: 'SvelteKit',
    frameworkSlug: 'sveltekit',
    frameworkPackage: '@sveltejs/kit',
    sourcemapsDocsLink:
      'https://docs.sentry.io/platforms/javascript/guides/sveltekit/manual-setup/#configure-source-maps-upload',
    wizard: runSvelteKitWizard,
  },
};

export async function redirectToMoreSuitableWizard(): Promise<
  WizardFunction | undefined
> {
  const packageJson = await getPackageDotJson();

  const installedSdkPackage = findPackageFromList(
    Object.keys(sdkMap),
    packageJson,
  );

  Sentry.setTag('using-wrong-wizard', false);

  if (!installedSdkPackage) {
    return undefined;
  }

  const {
    frameworkName,
    frameworkPackage,
    sourcemapsDocsLink,
    frameworkSlug,
    wizard,
  } = sdkMap[installedSdkPackage.name];

  if (!hasPackageInstalled(frameworkPackage, packageJson)) {
    // The user has installed the SDK but not the framework.
    // Maybe it's a false positive and the user is using a different framework.
    // Let's not redirect them to the framework wizard in that case.
    return undefined;
  }

  Sentry.setTag('using-wrong-wizard', true);

  const sdkName = installedSdkPackage.name;

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
https://docs.sentry.io/platforms/javascript/guides/${frameworkSlug}/sourcemaps/troubleshooting_js/
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
        { label: 'No, continue with this wizard', value: 'continue' },
        {
          label: "No, I'll check out the guides ",
          value: 'stop',
          hint: 'Close this wizard',
        },
      ],
    }),
  );

  Sentry.setTag('wrong-wizard-decision', nextStep);

  switch (nextStep) {
    case 'redirect':
      return wizard;
    case 'continue':
      return undefined;
    case 'stop':
      abort();
  }
}
