/* eslint-disable max-lines */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
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
  showCopyPasteInstructions,
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
import {
  addSentryInitWithSdkImport,
  doesJsCodeIncludeSdkSentryImport,
  getSentryInitColoredCodeSnippet,
} from './javascript';
import { traceStep, withTelemetry } from '../telemetry';
import * as Sentry from '@sentry/node';
import { fulfillsVersionRange } from '../utils/semver';
import { getIssueStreamUrl } from '../utils/url';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const xcode = require('xcode');

export const RN_SDK_PACKAGE = '@sentry/react-native';

export const RN_PACKAGE = 'react-native';
export const RN_HUMAN_NAME = 'React Native';

export const SUPPORTED_RN_RANGE = '>=0.69.0';

// The following SDK version ship with bundled Xcode scripts
// which simplifies the Xcode Build Phases setup.
export const SDK_XCODE_SCRIPTS_SUPPORTED_SDK_RANGE = '>=5.11.0';

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

  printWelcome({
    wizardName: 'Sentry React Native Wizard',
    promoCode: options.promoCode,
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, RN_PACKAGE, RN_HUMAN_NAME);

  const rnVersion = getPackageVersion(RN_PACKAGE, packageJson);
  if (rnVersion) {
    await confirmContinueIfPackageVersionNotSupported({
      packageName: RN_HUMAN_NAME,
      packageVersion: rnVersion,
      packageId: RN_PACKAGE,
      acceptableVersions: SUPPORTED_RN_RANGE,
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

  await installPackage({
    packageName: RN_SDK_PACKAGE,
    alreadyInstalled: hasPackageInstalled(RN_SDK_PACKAGE, packageJson),
  });
  const sdkVersion = getPackageVersion(
    RN_SDK_PACKAGE,
    await getPackageDotJson(),
  );

  await traceStep('patch-js', () =>
    addSentryInit({ dsn: selectedProject.keys[0].dsn.public }),
  );

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

async function addSentryInit({ dsn }: { dsn: string }) {
  const prefixGlob = '{.,./src}';
  const suffixGlob = '@(j|t|cj|mj)s?(x)';
  const universalGlob = `App.${suffixGlob}`;
  const jsFileGlob = `${prefixGlob}/+(${universalGlob})`;
  const jsPath = traceStep('find-app-js-file', () =>
    getFirstMatchedPath(jsFileGlob),
  );
  Sentry.setTag('app-js-file-status', jsPath ? 'found' : 'not-found');
  if (!jsPath) {
    clack.log.warn(
      `Could not find main App file using ${chalk.cyan(jsFileGlob)}.`,
    );
    await showCopyPasteInstructions(
      'App.js',
      getSentryInitColoredCodeSnippet(dsn),
      'This ensures the Sentry SDK is ready to capture errors.',
    );
    return;
  }
  const jsRelativePath = path.relative(process.cwd(), jsPath);

  const js = fs.readFileSync(jsPath, 'utf-8');
  const includesSentry = doesJsCodeIncludeSdkSentryImport(js, {
    sdkPackageName: RN_SDK_PACKAGE,
  });
  if (includesSentry) {
    Sentry.setTag('app-js-file-status', 'already-includes-sentry');
    clack.log.warn(
      `${chalk.cyan(
        jsRelativePath,
      )} already includes Sentry. We wont't add it again.`,
    );
    return;
  }

  traceStep('add-sentry-init', () => {
    const newContent = addSentryInitWithSdkImport(js, { dsn });

    clack.log.success(
      `Added ${chalk.cyan('Sentry.init')} to ${chalk.cyan(jsRelativePath)}.`,
    );

    fs.writeFileSync(jsPath, newContent, 'utf-8');
  });

  Sentry.setTag('app-js-file-status', 'added-sentry-init');
  clack.log.success(
    chalk.green(`${chalk.cyan(jsRelativePath)} changes saved.`),
  );
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
        acceptableVersions: SDK_XCODE_SCRIPTS_SUPPORTED_SDK_RANGE,
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
        acceptableVersions: SDK_XCODE_SCRIPTS_SUPPORTED_SDK_RANGE,
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
