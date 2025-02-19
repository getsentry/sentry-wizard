/* eslint-disable max-lines */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';

import {
  CliSetupConfigContent,
  abortIfCancelled,
  addSentryCliConfig,
  confirmContinueIfNoOrDirtyGitRepo,
  confirmContinueIfPackageVersionNotSupported,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
  propertiesCliSetupConfig,
  runPrettierIfInstalled,
  abort,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { podInstall } from '../apple/cocoapod';
import { platform } from 'os';
import {
  getValidExistingBuildPhases,
  findBundlePhase,
  patchBundlePhase,
  findDebugFilesUploadPhase,
  addDebugFilesUploadPhaseWithCli,
  writeXcodeProject,
  addSentryWithCliToBundleShellScript,
  addSentryWithBundledScriptsToBundleShellScript,
  addDebugFilesUploadPhaseWithBundledScripts,
} from './xcode';
import {
  doesAppBuildGradleIncludeRNSentryGradlePlugin,
  addRNSentryGradlePlugin,
  writeAppBuildGradle,
} from './gradle';
import { runReactNativeUninstall } from './uninstall';
import { APP_BUILD_GRADLE, XCODE_PROJECT, getFirstMatchedPath } from './glob';
import { ReactNativeWizardOptions } from './options';
import { addSentryInit } from './javascript';
import { traceStep, withTelemetry } from '../telemetry';
import * as Sentry from '@sentry/node';
import { fulfillsVersionRange } from '../utils/semver';
import { getIssueStreamUrl } from '../utils/url';
import {
  patchMetroConfigWithSentrySerializer,
  patchMetroWithSentryConfig,
} from './metro';
import { patchExpoAppConfig, printSentryExpoMigrationOutro } from './expo';
import { addSentryToExpoMetroConfig } from './expo-metro';
import { addExpoEnvLocal } from './expo-env-file';

import xcode from 'xcode';

export const RN_SDK_PACKAGE = '@sentry/react-native';
export const RN_SDK_SUPPORTED_RANGE = '>=5.0.0';

export const RN_PACKAGE = 'react-native';
export const RN_HUMAN_NAME = 'React Native';

export const SUPPORTED_RN_RANGE = '>=0.69.0';
export const SUPPORTED_EXPO_RANGE = '>=50.0.0';

/**
 * The following SDK version ship with bundled Xcode scripts
 * which simplifies the Xcode Build Phases setup.
 */
export const XCODE_SCRIPTS_SUPPORTED_SDK_RANGE = '>=5.11.0';

/**
 * The following SDK version ship with Sentry Metro plugin
 */
export const SENTRY_METRO_PLUGIN_SUPPORTED_SDK_RANGE = '>=5.11.0';

/**
 * The following SDK version ship with bundled Expo plugin
 */
export const EXPO_SUPPORTED_SDK_RANGE = `>=5.16.0`;

// The following SDK version shipped `withSentryConfig`
export const METRO_WITH_SENTRY_CONFIG_SUPPORTED_SDK_RANGE = '>=5.17.0';

export type RNCliSetupConfigContent = Pick<
  Required<CliSetupConfigContent>,
  'authToken' | 'org' | 'project' | 'url'
>;

export async function runReactNativeWizard(
  params: ReactNativeWizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: params.telemetryEnabled,
      integration: 'react-native',
      wizardOptions: params,
    },
    () => runReactNativeWizardWithTelemetry(params),
  );
}

export async function runReactNativeWizardWithTelemetry(
  options: ReactNativeWizardOptions,
): Promise<void> {
  if (options.uninstall) {
    Sentry.setTag('uninstall', true);
    return runReactNativeUninstall(options);
  }

  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry React Native Wizard',
    promoCode,
    telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();
  const hasInstalled = (dep: string) => hasPackageInstalled(dep, packageJson);

  if (hasInstalled('sentry-expo')) {
    Sentry.setTag('has-sentry-expo-installed', true);
    printSentryExpoMigrationOutro();
    return;
  }

  await ensurePackageIsInstalled(packageJson, RN_PACKAGE, RN_HUMAN_NAME);

  const rnVersion = getPackageVersion(RN_PACKAGE, packageJson);
  if (rnVersion) {
    await confirmContinueIfPackageVersionNotSupported({
      packageName: RN_HUMAN_NAME,
      packageVersion: rnVersion,
      packageId: RN_PACKAGE,
      acceptableVersions: SUPPORTED_RN_RANGE,
      note: `Please upgrade to ${SUPPORTED_RN_RANGE} if you wish to use the Sentry Wizard.
Or setup using ${chalk.cyan(
        'https://docs.sentry.io/platforms/react-native/manual-setup/manual-setup/',
      )}`,
    });
  }

  await installPackage({
    packageName: RN_SDK_PACKAGE,
    alreadyInstalled: hasPackageInstalled(RN_SDK_PACKAGE, packageJson),
    forceInstall,
  });
  const sdkVersion = getPackageVersion(
    RN_SDK_PACKAGE,
    await getPackageDotJson(),
  );
  if (sdkVersion) {
    await confirmContinueIfPackageVersionNotSupported({
      packageName: 'Sentry React Native SDK',
      packageVersion: sdkVersion,
      packageId: RN_SDK_PACKAGE,
      acceptableVersions: RN_SDK_SUPPORTED_RANGE,
      note: `Please upgrade to ${RN_SDK_SUPPORTED_RANGE} to continue with the wizard in this project.`,
    });
  } else {
    const continueWithoutSdk = await abortIfCancelled(
      clack.confirm({
        message:
          'Could not detect Sentry React Native SDK version. Do you want to continue anyway?',
      }),
    );
    if (!continueWithoutSdk) {
      await abort(undefined, 0);
    }
  }
  Sentry.setTag(`detected-sentry-react-native-sdk-version`, sdkVersion);

  const expoVersion = getPackageVersion('expo', packageJson);
  const isExpo = !!expoVersion;
  if (expoVersion && sdkVersion) {
    await confirmContinueIfPackageVersionNotSupported({
      packageName: 'Sentry React Native SDK',
      packageVersion: sdkVersion,
      packageId: RN_SDK_PACKAGE,
      acceptableVersions: EXPO_SUPPORTED_SDK_RANGE,
      note: `Please upgrade to ${EXPO_SUPPORTED_SDK_RANGE} to continue with the wizard in this Expo project.`,
    });
    await confirmContinueIfPackageVersionNotSupported({
      packageName: 'Expo SDK',
      packageVersion: expoVersion,
      packageId: 'expo',
      acceptableVersions: SUPPORTED_EXPO_RANGE,
      note: `Please upgrade to ${SUPPORTED_EXPO_RANGE} to continue with the wizard in this Expo project.`,
    });
  }

  const { selectedProject, authToken, sentryUrl } =
    await getOrAskForProjectData(options, 'react-native');
  const orgSlug = selectedProject.organization.slug;
  const projectSlug = selectedProject.slug;
  const projectId = selectedProject.id;
  const cliConfig: RNCliSetupConfigContent = {
    authToken,
    org: orgSlug,
    project: projectSlug,
    url: sentryUrl,
  };

  await traceStep('patch-app-js', () =>
    addSentryInit({ dsn: selectedProject.keys[0].dsn.public }),
  );

  if (isExpo) {
    await traceStep('patch-expo-app-config', () =>
      patchExpoAppConfig(cliConfig),
    );
    await traceStep('add-expo-env-local', () => addExpoEnvLocal(cliConfig));
  }

  if (isExpo) {
    await traceStep('patch-metro-config', addSentryToExpoMetroConfig);
  } else {
    await traceStep('patch-metro-config', () =>
      addSentryToMetroConfig({ sdkVersion }),
    );
  }

  if (fs.existsSync('ios')) {
    Sentry.setTag('patch-ios', true);
    await traceStep('patch-xcode-files', () =>
      patchXcodeFiles(cliConfig, { sdkVersion }),
    );
  }

  if (fs.existsSync('android')) {
    Sentry.setTag('patch-android', true);
    await traceStep('patch-android-files', () => patchAndroidFiles(cliConfig));
  }

  await runPrettierIfInstalled();

  const confirmedFirstException = await confirmFirstSentryException(
    sentryUrl,
    orgSlug,
    projectId,
  );

  Sentry.setTag('user-confirmed-first-error', confirmedFirstException);

  if (confirmedFirstException) {
    clack.outro(
      `${chalk.green('Everything is set up!')}

   ${chalk.dim(
     'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-react-native/issues',
   )}`,
    );
  } else {
    clack.outro(
      `${chalk.dim(
        'Let us know here: https://github.com/getsentry/sentry-react-native/issues',
      )}`,
    );
  }
}

function addSentryToMetroConfig({
  sdkVersion,
}: {
  sdkVersion: string | undefined;
}) {
  if (
    sdkVersion &&
    fulfillsVersionRange({
      version: sdkVersion,
      acceptableVersions: METRO_WITH_SENTRY_CONFIG_SUPPORTED_SDK_RANGE,
      canBeLatest: true,
    })
  ) {
    return patchMetroWithSentryConfig();
  }

  if (
    sdkVersion &&
    fulfillsVersionRange({
      version: sdkVersion,
      acceptableVersions: SENTRY_METRO_PLUGIN_SUPPORTED_SDK_RANGE,
      canBeLatest: true,
    })
  ) {
    return patchMetroConfigWithSentrySerializer();
  }
}

async function confirmFirstSentryException(
  url: string,
  orgSlug: string,
  projectId: string,
) {
  const issuesStreamUrl = getIssueStreamUrl({ url, orgSlug, projectId });

  clack.log
    .step(`To make sure everything is set up correctly, put the following code snippet into your application.
The snippet will create a button that, when tapped, sends a test event to Sentry.

After that check your project issues:

${chalk.cyan(issuesStreamUrl)}`);

  // We want the code snippet to be easily copy-pasteable, without any clack artifacts
  // eslint-disable-next-line no-console
  console.log(
    chalk.greenBright(`
<Button title='Try!' onPress={ () => { Sentry.captureException(new Error('First error')) }}/>
`),
  );

  const firstErrorConfirmed = clack.confirm({
    message: `Have you successfully sent a test event?`,
  });

  return firstErrorConfirmed;
}

async function patchXcodeFiles(
  config: RNCliSetupConfigContent,
  context: {
    sdkVersion: string | undefined;
  },
) {
  await addSentryCliConfig(config, {
    ...propertiesCliSetupConfig,
    name: 'source maps and iOS debug files',
    filename: 'ios/sentry.properties',
    gitignore: false,
  });

  if (platform() === 'darwin' && (await confirmPodInstall())) {
    await traceStep('pod-install', () => podInstall('ios'));
  }

  const xcodeProjectPath = traceStep('find-xcode-project', () =>
    getFirstMatchedPath(XCODE_PROJECT),
  );
  Sentry.setTag(
    'xcode-project-status',
    xcodeProjectPath ? 'found' : 'not-found',
  );
  if (!xcodeProjectPath) {
    clack.log.warn(
      `Could not find Xcode project file using ${chalk.cyan(XCODE_PROJECT)}.`,
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [xcodeProject, buildPhasesMap] = traceStep(
    'parse-xcode-project',
    () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const project = xcode.project(xcodeProjectPath);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      project.parseSync();

      const map = getValidExistingBuildPhases(project);
      return [project, map];
    },
  );
  Sentry.setTag('xcode-project-status', 'parsed');

  traceStep('patch-bundle-phase', () => {
    const bundlePhase = findBundlePhase(buildPhasesMap);
    Sentry.setTag(
      'xcode-bundle-phase-status',
      bundlePhase ? 'found' : 'not-found',
    );
    if (
      context.sdkVersion &&
      fulfillsVersionRange({
        version: context.sdkVersion,
        acceptableVersions: XCODE_SCRIPTS_SUPPORTED_SDK_RANGE,
        canBeLatest: true,
      })
    ) {
      patchBundlePhase(
        bundlePhase,
        addSentryWithBundledScriptsToBundleShellScript,
      );
    } else {
      patchBundlePhase(bundlePhase, addSentryWithCliToBundleShellScript);
    }
    Sentry.setTag('xcode-bundle-phase-status', 'patched');
  });

  traceStep('add-debug-files-upload-phase', () => {
    const debugFilesUploadPhaseExists =
      !!findDebugFilesUploadPhase(buildPhasesMap);
    Sentry.setTag(
      'xcode-debug-files-upload-phase-status',
      debugFilesUploadPhaseExists ? 'already-exists' : undefined,
    );
    if (
      context.sdkVersion &&
      fulfillsVersionRange({
        version: context.sdkVersion,
        acceptableVersions: XCODE_SCRIPTS_SUPPORTED_SDK_RANGE,
        canBeLatest: true,
      })
    ) {
      addDebugFilesUploadPhaseWithBundledScripts(xcodeProject, {
        debugFilesUploadPhaseExists,
      });
    } else {
      addDebugFilesUploadPhaseWithCli(xcodeProject, {
        debugFilesUploadPhaseExists,
      });
    }
    Sentry.setTag('xcode-debug-files-upload-phase-status', 'added');
  });

  traceStep('write-xcode-project', () => {
    writeXcodeProject(xcodeProjectPath, xcodeProject);
  });
  Sentry.setTag('xcode-project-status', 'patched');
}

async function patchAndroidFiles(config: RNCliSetupConfigContent) {
  await addSentryCliConfig(config, {
    ...propertiesCliSetupConfig,
    name: 'source maps and iOS debug files',
    filename: 'android/sentry.properties',
    gitignore: false,
  });

  const appBuildGradlePath = traceStep('find-app-build-gradle', () =>
    getFirstMatchedPath(APP_BUILD_GRADLE),
  );
  Sentry.setTag(
    'app-build-gradle-status',
    appBuildGradlePath ? 'found' : 'not-found',
  );
  if (!appBuildGradlePath) {
    clack.log.warn(
      `Could not find Android ${chalk.cyan(
        'app/build.gradle',
      )} file using ${chalk.cyan(APP_BUILD_GRADLE)}.`,
    );
    return;
  }

  const appBuildGradle = traceStep('read-app-build-gradle', () =>
    fs.readFileSync(appBuildGradlePath, 'utf-8'),
  );
  const includesSentry =
    doesAppBuildGradleIncludeRNSentryGradlePlugin(appBuildGradle);
  if (includesSentry) {
    Sentry.setTag('app-build-gradle-status', 'already-includes-sentry');
    clack.log.warn(
      `Android ${chalk.cyan('app/build.gradle')} file already includes Sentry.`,
    );
    return;
  }

  const patchedAppBuildGradle = traceStep('add-rn-sentry-gradle-plugin', () =>
    addRNSentryGradlePlugin(appBuildGradle),
  );
  if (!doesAppBuildGradleIncludeRNSentryGradlePlugin(patchedAppBuildGradle)) {
    Sentry.setTag(
      'app-build-gradle-status',
      'failed-to-add-rn-sentry-gradle-plugin',
    );
    clack.log.warn(
      `Could not add Sentry RN Gradle Plugin to ${chalk.cyan(
        'app/build.gradle',
      )}.`,
    );
    return;
  }

  Sentry.setTag('app-build-gradle-status', 'added-rn-sentry-gradle-plugin');
  clack.log.success(
    `Added Sentry RN Gradle Plugin to ${chalk.bold('app/build.gradle')}.`,
  );

  traceStep('write-app-build-gradle', () =>
    writeAppBuildGradle(appBuildGradlePath, patchedAppBuildGradle),
  );
  clack.log.success(
    chalk.green(`Android ${chalk.cyan('app/build.gradle')} saved.`),
  );
}

async function confirmPodInstall(): Promise<boolean> {
  return traceStep('confirm-pod-install', async () => {
    const continueWithPodInstall = await abortIfCancelled(
      clack.select({
        message: 'Do you want to run `pod install` now?',
        options: [
          {
            value: true,
            label: 'Yes',
            hint: 'Recommended for smaller projects, this might take several minutes',
          },
          { value: false, label: `No, I'll do it later` },
        ],
        initialValue: true,
      }),
    );
    Sentry.setTag('continue-with-pod-install', continueWithPodInstall);
    return continueWithPodInstall;
  });
}
