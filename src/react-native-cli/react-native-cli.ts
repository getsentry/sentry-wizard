// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { withTelemetry } from '../telemetry';
import { abort, printWelcome } from '../utils/clack-utils';
import { WizardOptions } from '../utils/types';
import * as childProcess from 'child_process';
import { abortIfCancelled } from '../utils/clack-utils';

const nodePath = process.execPath;
const reactNativeCommunityCliPath = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  'react-native',
);
const androidHermesCompilerPath = path.join(
  process.cwd(),
  'node_modules',
  'react-native',
  'sdks',
  'hermesc',
  process.platform === 'darwin'
    ? 'osx-bin'
    : process.platform === 'win32'
    ? 'win64-bin'
    : 'linux64-bin',
  'hermesc',
);
const appleMobileHermesCompilerPath = path.join(
  process.cwd(),
  'ios',
  'Pods',
  'hermes-engine',
  'destroot',
  'bin',
  'hermesc',
);
const composeSourceMapsPath = path.join(
  process.cwd(),
  'node_modules',
  'react-native',
  'scripts',
  'compose-source-maps.js',
);
const appJsonPath = path.join(process.cwd(), 'app.json');
const gradlePropertiesPath = path.join(
  process.cwd(),
  'android',
  'gradle.properties',
);
const appleMobilePodFileLockPath = path.join(
  process.cwd(),
  'ios',
  'Podfile.lock',
);
const defaultEntryFilePath = path.join(process.cwd(), 'index.js');

const spinner: ReturnType<typeof clack.spinner> = clack.spinner();

type ReactNativeCliArgs = {
  dryRun?: boolean;
  verbose?: boolean;
  platform?: ('android' | 'ios')[];
} & WizardOptions;

export async function runReactNativeCli(
  options: ReactNativeCliArgs,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'sourcemaps',
    },
    () => runReactNativeCliWithTelemetry(options),
  );
}

async function runReactNativeCliWithTelemetry(
  options: ReactNativeCliArgs,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry React Native CLI',
    message: `This command line tool will help you generate React Native bundle and source maps.
Thank you for using Sentry :)${
      options.telemetryEnabled
        ? `

(This tool sends telemetry data and crash reports to Sentry.
You can turn this off by running the wizard with the '--disable-telemetry' flag.)`
        : ''
    }`,
    promoCode: options.promoCode,
  });

  const runsOnAppleDesktop = process.platform === 'darwin';
  const wantedPlatforms = options.platform || ['android', 'ios'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appJson: {
    expo?: {
      ios?: unknown;
      android?: unknown;
    };
  } = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  } catch (e) {
    // Ignore
  }

  const isAppleMobile =
    wantedPlatforms.includes('ios') &&
    (fs.existsSync(path.join(process.cwd(), 'ios')) || appJson?.expo?.ios);
  const isAndroidMobile =
    wantedPlatforms.includes('android') &&
    (fs.existsSync(path.join(process.cwd(), 'android')) ||
      appJson?.expo?.android);

  let isAndroidMobileHermes: boolean | undefined = undefined;
  try {
    const gradleProperties = fs.readFileSync(gradlePropertiesPath, 'utf8');
    isAndroidMobileHermes = /(^|\n)(react\.)?hermesEnabled=true/.test(
      gradleProperties,
    );
  } catch (e) {
    // Ignore
  }
  if (isAndroidMobileHermes === undefined) {
    const doYouUseHermesAndroid = await abortIfCancelled(
      clack.select({
        message: 'Do you use Hermes on Android?',
        options: [
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ],
        initialValue: true,
      }),
    );
    isAndroidMobileHermes = doYouUseHermesAndroid;
  }

  let isAppleMobileHermes: boolean | undefined = false;
  try {
    const podFileLock = fs.readFileSync(appleMobilePodFileLockPath, 'utf8');
    isAppleMobileHermes = podFileLock.includes('hermes-engine:');
  } catch (e) {
    // Ignore
  }
  if (isAppleMobileHermes === undefined && runsOnAppleDesktop) {
    clack.log.warn(
      'Seems like you `ios/Pods` directory is missing lock file. Consider running `pod install` and then try again.',
    );
    const doYouUseHermesApple = await abortIfCancelled(
      clack.select({
        message: 'Do you use Hermes on iOS?',
        options: [
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ],
        initialValue: true,
      }),
    );
    isAppleMobileHermes = !!doYouUseHermesApple;
  }

  const detectedEnvironmentInfoMessages: string[] = [];
  isAndroidMobile &&
    isAndroidMobileHermes &&
    detectedEnvironmentInfoMessages.push(
      'Detected Android project with Hermes enabled.',
    );
  isAndroidMobile &&
    !isAndroidMobileHermes &&
    detectedEnvironmentInfoMessages.push(
      'Detected Android project with JavaScript Core enabled.',
    );
  isAppleMobile &&
    isAppleMobileHermes &&
    detectedEnvironmentInfoMessages.push(
      'Detected iOS project with Hermes enabled.',
    );
  isAppleMobile &&
    !isAppleMobileHermes &&
    detectedEnvironmentInfoMessages.push(
      'Detected iOS project with JavaScript Core enabled.',
    );
  detectedEnvironmentInfoMessages.forEach((message) => {
    clack.log.info(message);
  });

  const doesUserWantContinue = await abortIfCancelled(
    clack.confirm({
      message: 'Do you want to proceed?',
      initialValue: true,
    }),
  );
  if (!doesUserWantContinue) {
    await abort();
  }

  if (isAppleMobile && !runsOnAppleDesktop) {
    clack.log.warn(
      "You are on a non-Apple platform, but you have an iOS project, the iOS bundle won't be generated.",
    );
  }

  let entryFilePath = defaultEntryFilePath;
  if (!fs.existsSync(entryFilePath)) {
    const userEntryPath = await abortIfCancelled(
      clack.text({
        message:
          'Could not detect your entry file, please enter the path manually:',
        initialValue: entryFilePath,
        validate: (value) => {
          if (!fs.existsSync(value)) {
            return 'File does not exist.';
          }
          return undefined;
        },
      }),
    );
    entryFilePath = userEntryPath;
  }

  options.verbose
    ? clack.log.step('Generate packager bundle and source maps...')
    : spinner.start(
        `Generating React Native bundle and source maps with Metro...`,
      );

  if (isAppleMobile && runsOnAppleDesktop) {
    await execute(
      reactNativeCommunityCliPath,
      [
        'bundle',
        '--dev',
        'false',
        '--minify',
        'false',
        '--platform',
        'ios',
        '--entry-file',
        entryFilePath,
        '--reset-cache',
        '--bundle-output',
        'index.android.bundle',
        '--sourcemap-output',
        'index.android.bundle.map',
      ],
      options,
    );
  }

  if (isAndroidMobile) {
    await execute(
      reactNativeCommunityCliPath,
      [
        'bundle',
        '--dev',
        'false',
        '--minify',
        'false',
        '--platform',
        'android',
        '--entry-file',
        entryFilePath,
        '--reset-cache',
        '--bundle-output',
        'index.android.bundle',
        '--sourcemap-output',
        'index.android.bundle.map',
      ],
      options,
    );
  }

  options.verbose
    ? clack.log.success('React Native bundle and source maps generated.')
    : spinner?.stop('React Native bundle and source maps generated.');
  clack.log.success('Packager bundle and source maps generated.');
  clack.log.info(
    `Packager bundle saved to: ${chalk.cyan(
      'dist/android/packager/index.android.bundle',
    )}`,
  );
  clack.log.info(
    `Packager source map saved to: ${chalk.cyan(
      'dist/android/packager/index.android.bundle.map',
    )}`,
  );

  options.verbose
    ? clack.log.step('Compile Hermes bundle...')
    : spinner.start('Compiling Hermes bundle...');

  await execute(
    androidHermesCompilerPath,
    [
      '-O',
      '-emit-binary',
      '-output-source-map',
      '-out=index.android.bundle.hbc',
      'index.android.bundle',
    ],
    options,
  );

  options.verbose
    ? clack.log.success('Hermes compilation successful.')
    : spinner?.stop('Hermes compilation successful.');
  options.verbose
    ? clack.log.step('Compose Hermes and Packager source maps...')
    : spinner.start('Composing Hermes and Packager source maps...');

  await execute(
    nodePath,
    [
      composeSourceMapsPath,
      'index.android.bundle.map',
      'index.android.bundle.hbc.map',
      'dist/android/hermes/index.android.bundle.hbc.map',
    ],
    options,
  );

  // await copyDebugId({
  //   packagerSourceMapPath: 'index.android.bundle.map',
  //   composedSourceMapPath: 'dist/android/hermes/index.android.bundle.hbc.map',
  // });

  options.verbose
    ? clack.log.success('Hermes and Packager source maps composed.')
    : spinner?.stop('Hermes and Packager source maps composed.');

  clack.log.info(
    'Hermes composed source map saved to: dist/android/hermes/index.android.bundle.map',
  );

  //   const hasDebugId = hasSourceMapDebugId();
  //   if (!hasDebugId) {
  //     clack.note(
  //       // TODO: Add better message and link to docs
  //       `It seems like your project doesn't have a debug ID in the source maps.
  // `,
  //     );
  //   }

  clack.outro(`All done! 🎉`);
}

async function execute(
  bin: string,
  args: string[],
  options: {
    verbose?: boolean;
    dryRun?: boolean;
  },
): Promise<void> {
  if (options.dryRun) {
    clack.log.warn(`Would run: ${bin} ${args.join(' ')}`);
    return;
  }

  let stdout = '',
    stderr = '';
  let newProcess: childProcess.ChildProcess | undefined;
  try {
    await new Promise((resolve, reject) => {
      newProcess = childProcess.spawn(bin, args, {
        stdio: 'pipe',
        cwd: process.cwd(),
      });
      newProcess.stdout &&
        newProcess.stdout.on('data', (data) => {
          stdout += data;
          options.verbose && process.stdout.write(data);
        });
      newProcess.stderr &&
        newProcess.stderr.on('data', (data) => {
          stderr += data;
          options.verbose && process.stderr.write(data);
        });
      newProcess.on('close', (code) => {
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(stderr);
        }
      });
    });
  } catch (e) {
    // Kill the process if it's still running, this might happen during JS errors for example
    newProcess?.kill();
    spinner?.stop('Child process failed.');
    // Write a log file so we can better troubleshoot issues
    fs.writeFileSync(
      path.join(
        process.cwd(),
        `sentry-react-native-cli-error-${Date.now()}.log`,
      ),
      JSON.stringify({
        stdout,
        stderr,
      }),
      { encoding: 'utf8' },
    );
    clack.log.error(
      `${chalk.red(
        'Encountered the following error:',
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      )}\n\n${e}\n\n${chalk.dim(
        `The wizard has created a ${chalk.cyan(
          'sentry-react-native-cli-error-*.log',
        )} file.
If you think this issue is caused by the Sentry wizard,
create an issue on GitHub and include the log file's content:

${chalk.cyan('https://github.com/getsentry/sentry-wizard/issues')}`,
      )}`,
    );
    await abort();
  }
}
