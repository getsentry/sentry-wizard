// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { minVersion, satisfies } from 'semver';
import {
  abortIfCancelled,
  getPackageDotJson,
  getPackageVersion,
  hasPackageInstalled,
  installPackage,
} from '../../utils/clack-utils';

import * as Sentry from '@sentry/node';

const MINIMUM_DEBUG_ID_SDK_VERSION = '7.47.0';

const SENTRY_SDK_PACKAGES = [
  // SDKs using other framework SDKs need to be checked first
  '@sentry/gatsby',
  '@sentry/nextjs',
  '@sentry/remix',
  '@sentry/sveltekit',

  // Framework SDKs
  '@sentry/angular',
  '@sentry/angular-ivy',
  '@sentry/ember',
  '@sentry/react',
  '@sentry/svelte',
  '@sentry/vue',
  '@sentry/serverless',

  // Base SDKs
  '@sentry/browser',
  '@sentry/node',
];

/**
 * Check for a minimum SDK version and prompt the user to upgrade if necessary.
 * We distinguish between 4 cases here:
 *
 * 1. Users didn't install any SDK yet
 *    -> We tell them to install an SDK and then continue with the wizard
 * 2. Users installed an SDK in the range >=7.47.0
 *    -> All good, no need to do anything!
 * 3. Users installed an SDK in the range >=7.0.0 <= 7.46.0
 *    -> We ask if they want to auto-update to the latest version
 * 4. Users installed an SDK in the range <7.x
 *    -> We tell users to manually upgrade (migrate between majors)
 */
export async function ensureMinimumSdkVersionIsInstalled(): Promise<void> {
  const packageJson = await getPackageDotJson();

  const installedSdkPackage = SENTRY_SDK_PACKAGES.find((sdkPackage) =>
    hasPackageInstalled(sdkPackage, packageJson),
  );

  // Case 1:
  if (!installedSdkPackage) {
    return await handleNoSdkInstalled();
  }

  const installedSdkVersionOrRange =
    getPackageVersion(installedSdkPackage, packageJson) || '';
  const minInstalledVersion =
    minVersion(installedSdkVersionOrRange)?.version || '';

  const hasDebugIdCompatibleSdkVersion = satisfies(
    minInstalledVersion,
    `>=${MINIMUM_DEBUG_ID_SDK_VERSION}`,
  );

  // Case 2:
  if (hasDebugIdCompatibleSdkVersion) {
    Sentry.setTag('initial_sdk_version', '>=7.47.0');
    return;
  }

  const hasV7SdkVersion = satisfies(minInstalledVersion, '>=7.0.0');

  clack.log.warn(
    `${chalk.yellowBright(
      `It seems like you're using an outdated version (${installedSdkVersionOrRange}) of the ${chalk.bold(
        installedSdkPackage,
      )} SDK.`,
    )}
Uploading source maps is easiest with an SDK from version ${chalk.bold(
      MINIMUM_DEBUG_ID_SDK_VERSION,
    )} or newer.    
`,
  );

  // Case 3:
  if (hasV7SdkVersion) {
    await handleAutoUpdateSdk(installedSdkPackage);
    return;
  }

  // Case 4:
  await handleManuallyUpdateSdk(minInstalledVersion);
}

async function handleManuallyUpdateSdk(minInstalledVersion: string) {
  Sentry.setTag(
    'initial_sdk_version',
    `${satisfies(minInstalledVersion, '>=6.0.0') ? '6.x' : '<6.0.0'}`,
  );

  clack.log
    .info(`When upgrading from a version older than 7.0.0, make sure to follow the migration guide:
https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#upgrading-from-6x-to-7x
`);

  const didUpdate = await abortIfCancelled(
    clack.select({
      message: 'Did you update your SDK to the latest version?',
      options: [
        {
          label: 'Yes!',
          value: true,
        },
        {
          label: "No, I'll do it later...",
          value: false,
          hint: chalk.yellow(
            `Remember to update your SDK to at least ${MINIMUM_DEBUG_ID_SDK_VERSION}.`,
          ),
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag(
    'resolved_sdk_status',
    didUpdate ? 'updated_manually' : 'update_later',
  );
}

async function handleAutoUpdateSdk(packageName: string) {
  Sentry.setTag('initial_sdk_version', '>=7.0.0 <= 7.47.0');

  const shouldUpdate = await abortIfCancelled(
    clack.select({
      message:
        'Do you want to automatically update your SDK to the latest version?',
      options: [
        {
          label: 'Yes!',
          value: true,
          hint: chalk.greenBright('Recommended'),
        },
        {
          label: "No, I'll do it later...",
          value: false,
          hint: chalk.yellow(
            `Remember to update your SDK to at least ${MINIMUM_DEBUG_ID_SDK_VERSION}.`,
          ),
        },
      ],
      initialValue: true,
    }),
  );

  if (shouldUpdate) {
    await installPackage({
      packageName,
      alreadyInstalled: true,
      askBeforeUpdating: false, // we already did this above
    });
  }

  Sentry.setTag(
    'resolved_sdk_status',
    shouldUpdate ? 'updated_automatically' : 'update_later',
  );
}

async function handleNoSdkInstalled(): Promise<void> {
  Sentry.setTag('initial_sdk_version', 'none');

  clack.log.warn(
    `${chalk.yellowBright(
      `It seems like you didn't yet install a Sentry SDK in your project.`,
    )}
We recommend setting up the SDK before continuing with the source maps wizard.

${chalk.dim(`Take a look at our docs to get started:
https://docs.sentry.io/`)}`,
  );

  const installedSDK = await abortIfCancelled(
    clack.select({
      message: 'Did you set up your Sentry SDK?',
      options: [
        { label: 'Yes, continue!', value: true },
        {
          label: "I'll do it later...",
          value: false,
          hint: chalk.yellow(
            'You need to set up an SDK before you can use Sentry',
          ),
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag(
    'resolved_sdk_status',
    installedSDK ? 'installed_manually' : 'install_later',
  );
}
