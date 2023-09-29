/* eslint-disable max-lines */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import {
  addSentryCliConfig,
  confirmContinueIfNoOrDirtyGitRepo,
  confirmContinueIfPackageVersionNotSupported,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
  propertiesCliSetupConfig,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { podInstall } from '../apple/cocoapod';
import { platform } from 'os';
import {
  getValidExistingBuildPhases,
  findBundlePhase,
  patchBundlePhase,
  findDebugFilesUploadPhase,
  patchDebugFilesUploadPhase,
  writeXcodeProject,
} from './xcode';
import {
  doesAppBuildGradleIncludeSentry,
  patchAppBuildGradle,
  writeAppBuildGradle,
} from './gradle';
import { runReactNativeUninstall } from './uninstall';
import { APP_BUILD_GRADLE, XCODE_PROJECT, getFirstMatchedPath } from './glob';
import { ReactNativeWizardOptions } from './options';
import { SentryProjectData } from '../utils/types';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const xcode = require('xcode');

export const RN_SDK_PACKAGE = '@sentry/react-native';

export const RN_PACKAGE = 'react-native';
export const RN_HUMAN_NAME = 'React Native';

export const SUPPORTED_RN_RANGE = '>=0.69.0';

export async function runReactNativeWizard(
  options: ReactNativeWizardOptions,
): Promise<void> {
  options.telemetryEnabled = false;

  if (options.uninstall) {
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

  const { selectedProject, authToken } = await getOrAskForProjectData(
    options,
    'react-native',
  );

  await installPackage({
    packageName: RN_SDK_PACKAGE,
    alreadyInstalled: hasPackageInstalled(RN_SDK_PACKAGE, packageJson),
  });

  addSentryInit({ dsn: selectedProject.keys[0].dsn.public });

  await patchXcodeFiles({ authToken });

  await patchAndroidFiles({ authToken });

  const confirmedFirstException = await confirmFirstSentryException(selectedProject);

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

function addSentryInit({ dsn }: { dsn: string }) {
  const prefixGlob = '{.,./src}';
  const suffixGlob = '@(j|t|cj|mj)s?(x)';
  const universalGlob = `App.${suffixGlob}`;
  const jsFileGlob = `${prefixGlob}/+(${universalGlob})`;
  const jsPath = getFirstMatchedPath(jsFileGlob);
  if (!jsPath) {
    clack.log.warn(
      `Could not find main App file using ${chalk.bold(jsFileGlob)}.`,
    );
    return;
  }
  const jsRelativePath = path.relative(process.cwd(), jsPath);

  const js = fs.readFileSync(jsPath, 'utf-8');
  if (js.match(RN_SDK_PACKAGE)) {
    clack.log.warn(`${chalk.bold(jsRelativePath)} already includes Sentry.`);
    return;
  }

  const newContent = js.replace(
    /^([^]*)(import\s+[^;]*?;$)/m,
    (match: string) => `${match}
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: '${dsn}',
});

`,
  );
  fs.writeFileSync(jsPath, newContent, 'utf-8');
}

async function confirmFirstSentryException(project: SentryProjectData) {
  const projectsIssuesUrl = `${project.organization.links.organizationUrl}/issues/?project=${project.id}`;

  clack.note(`To make sure everything is set up correctly, put the following code snippet into your application.
The snippet will create a button that, when tapped, sends a test event to Sentry.

After that check your project issues:

${projectsIssuesUrl}

<Button title='Try!' onPress={ () => { Sentry.captureException(new Error('First error')) }}/>`);

  const firstErrorConfirmed = clack.confirm({
    message: `Have you successfully sent a test event?`,
  });

  return firstErrorConfirmed;
}

async function patchXcodeFiles({ authToken }: { authToken: string }) {
  await addSentryCliConfig(authToken, {
    ...propertiesCliSetupConfig,
    name: 'source maps and iOS debug files',
    filename: 'ios/sentry.properties',
  });

  if (platform() === 'darwin') {
    await podInstall();
  }

  const xcodeProjectPath = getFirstMatchedPath(XCODE_PROJECT);
  if (!xcodeProjectPath) {
    clack.log.warn(
      `Could not find Xcode project file using ${chalk.bold(XCODE_PROJECT)}.`,
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const xcodeProject = xcode.project(xcodeProjectPath);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  xcodeProject.parseSync();
  const buildPhasesMap = getValidExistingBuildPhases(xcodeProject);

  const bundlePhase = findBundlePhase(buildPhasesMap);
  patchBundlePhase(bundlePhase);

  const debugFilesUploadPhaseExists =
    !!findDebugFilesUploadPhase(buildPhasesMap);
  patchDebugFilesUploadPhase(xcodeProject, { debugFilesUploadPhaseExists });

  writeXcodeProject(xcodeProjectPath, xcodeProject);
}

async function patchAndroidFiles({ authToken }: { authToken: string }) {
  await addSentryCliConfig(authToken, {
    ...propertiesCliSetupConfig,
    name: 'source maps and iOS debug files',
    filename: 'android/sentry.properties',
  });

  const appBuildGradlePath = getFirstMatchedPath(APP_BUILD_GRADLE);
  if (!appBuildGradlePath) {
    clack.log.warn(
      `Could not find Android app/build.gradle file using ${chalk.bold(
        APP_BUILD_GRADLE,
      )}.`,
    );
    return;
  }

  const appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf-8');
  const includesSentry = doesAppBuildGradleIncludeSentry(appBuildGradle);
  if (includesSentry) {
    clack.log.warn(`Android app/build.gradle file already includes Sentry.`);
    return;
  }

  const patchedAppBuildGradle = patchAppBuildGradle(appBuildGradle);

  writeAppBuildGradle(appBuildGradlePath, patchedAppBuildGradle);
}
