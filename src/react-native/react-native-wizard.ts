/* eslint-disable max-lines */
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';

import * as Sentry from '@sentry/node';
import { platform } from 'os';
import { podInstall } from '../apple/cocoapod';
import { traceStep, withTelemetry } from '../telemetry';
import {
  CliSetupConfigContent,
  abort,
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
} from '../utils/clack';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { getIssueStreamUrl } from '../utils/url';
import { patchExpoAppConfig, printSentryExpoMigrationOutro } from './expo';
import { addExpoEnvLocal } from './expo-env-file';
import { addSentryToExpoMetroConfig } from './expo-metro';
import { APP_BUILD_GRADLE, XCODE_PROJECT, getFirstMatchedPath } from './glob';
import {
  addRNSentryGradlePlugin,
  doesAppBuildGradleIncludeRNSentryGradlePlugin,
  writeAppBuildGradle,
} from './gradle';
import {
  addSentryInit,
  sessionReplayOnErrorSampleRate,
  sessionReplaySampleRate,
  wrapRootComponent,
} from './javascript';
import { patchMetroWithSentryConfig } from './metro';
import { ReactNativeWizardOptions } from './options';
import {
  addDebugFilesUploadPhaseWithBundledScripts,
  addSentryWithBundledScriptsToBundleShellScript,
  findBundlePhase,
  findDebugFilesUploadPhase,
  getValidExistingBuildPhases,
  patchBundlePhase,
  writeXcodeProject,
} from './xcode';

import xcode from 'xcode';

export const RN_SDK_PACKAGE = '@sentry/react-native';
export const RN_SDK_SUPPORTED_RANGE = '>=6.12.0';

export const RN_PACKAGE = 'react-native';
export const RN_HUMAN_NAME = 'React Native';

export const SUPPORTED_RN_RANGE = '>=0.69.0';
export const SUPPORTED_EXPO_RANGE = '>=50.0.0';

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
  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry React Native Wizard',
    promoCode,
    telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

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
Or setup using ${pc.cyan(
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
  if (expoVersion) {
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

  // Ask if user wants to enable Session Replay
  const enableSessionReplay = await abortIfCancelled(
    clack.confirm({
      message:
        'Do you want to enable Session Replay to help debug issues? (See https://docs.sentry.io/platforms/react-native/session-replay/)',
    }),
  );
  Sentry.setTag('enable-session-replay', enableSessionReplay);

  if (enableSessionReplay) {
    clack.log.info(
      `Session Replay will be enabled with default settings (replaysSessionSampleRate: ${sessionReplaySampleRate}, replaysOnErrorSampleRate: ${sessionReplayOnErrorSampleRate}).`,
    );
    clack.log.message(
      'By default, all text content, images, and webviews will be masked for privacy. You can customize this in your code later.',
    );
  }

  // Ask if user wants to enable the Feedback Widget
  const enableFeedbackWidget = await abortIfCancelled(
    clack.confirm({
      message:
        'Do you want to enable the Feedback Widget to collect feedback from your users? (See https://docs.sentry.io/platforms/react-native/user-feedback/)',
    }),
  );
  Sentry.setTag('enable-feedback-widget', enableFeedbackWidget);

  if (enableFeedbackWidget) {
    clack.log.info(
      `The Feedback Widget will be enabled with default settings. You can show the widget by calling Sentry.showFeedbackWidget() in your code.`,
    );
  }

  await traceStep('patch-app-js', () =>
    addSentryInit({
      dsn: selectedProject.keys[0].dsn.public,
      enableSessionReplay,
      enableFeedbackWidget,
    }),
  );

  await traceStep('patch-app-js-wrap', () => wrapRootComponent());

  if (isExpo) {
    await traceStep('patch-expo-app-config', () =>
      patchExpoAppConfig(cliConfig),
    );
    await traceStep('add-expo-env-local', () => addExpoEnvLocal(cliConfig));
  }

  if (isExpo) {
    await traceStep('patch-metro-config', addSentryToExpoMetroConfig);
  } else {
    await traceStep('patch-metro-config', patchMetroWithSentryConfig);
  }

  if (fs.existsSync('ios')) {
    Sentry.setTag('patch-ios', true);
    await traceStep('patch-xcode-files', () => patchXcodeFiles(cliConfig));
  }

  if (fs.existsSync('android')) {
    Sentry.setTag('patch-android', true);
    await traceStep('patch-android-files', () => patchAndroidFiles(cliConfig));
  }

  await runPrettierIfInstalled({ cwd: undefined });

  const confirmedFirstException = await confirmFirstSentryException(
    sentryUrl,
    orgSlug,
    projectId,
  );

  Sentry.setTag('user-confirmed-first-error', confirmedFirstException);

  if (confirmedFirstException) {
    clack.outro(
      `${pc.green('Everything is set up!')}

   ${pc.dim(
     'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-react-native/issues',
   )}`,
    );
  } else {
    clack.outro(
      `${pc.dim(
        'Let us know here: https://github.com/getsentry/sentry-react-native/issues',
      )}`,
    );
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

${pc.cyan(issuesStreamUrl)}`);

  // We want the code snippet to be easily copy-pasteable, without any clack artifacts
  // eslint-disable-next-line no-console
  console.log(
    pc.greenBright(`
<Button title='Try!' onPress={ () => { Sentry.captureException(new Error('First error')) }}/>
`),
  );

  const firstErrorConfirmed = clack.confirm({
    message: `Have you successfully sent a test event?`,
  });

  return firstErrorConfirmed;
}

async function patchXcodeFiles(config: RNCliSetupConfigContent) {
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
      `Could not find Xcode project file using ${pc.cyan(XCODE_PROJECT)}.`,
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

  await traceStep('patch-bundle-phase', async () => {
    const bundlePhase = findBundlePhase(buildPhasesMap);
    Sentry.setTag(
      'xcode-bundle-phase-status',
      bundlePhase ? 'found' : 'not-found',
    );

    await patchBundlePhase(
      bundlePhase,
      addSentryWithBundledScriptsToBundleShellScript,
    );

    Sentry.setTag('xcode-bundle-phase-status', 'patched');
  });

  traceStep('add-debug-files-upload-phase', () => {
    const debugFilesUploadPhaseExists =
      !!findDebugFilesUploadPhase(buildPhasesMap);
    Sentry.setTag(
      'xcode-debug-files-upload-phase-status',
      debugFilesUploadPhaseExists ? 'already-exists' : undefined,
    );

    addDebugFilesUploadPhaseWithBundledScripts(xcodeProject, {
      debugFilesUploadPhaseExists,
    });

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
      `Could not find Android ${pc.cyan(
        'app/build.gradle',
      )} file using ${pc.cyan(APP_BUILD_GRADLE)}.`,
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
      `Android ${pc.cyan('app/build.gradle')} file already includes Sentry.`,
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
      `Could not add Sentry RN Gradle Plugin to ${pc.cyan(
        'app/build.gradle',
      )}.`,
    );
    return;
  }

  Sentry.setTag('app-build-gradle-status', 'added-rn-sentry-gradle-plugin');
  clack.log.success(
    `Added Sentry RN Gradle Plugin to ${pc.bold('app/build.gradle')}.`,
  );

  traceStep('write-app-build-gradle', () =>
    writeAppBuildGradle(appBuildGradlePath, patchedAppBuildGradle),
  );
  clack.log.success(pc.green(`Android ${pc.cyan('app/build.gradle')} saved.`));
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
