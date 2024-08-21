// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { withTelemetry } from '../telemetry';
import { abort, printWelcome } from '../utils/clack-utils';
import * as childProcess from 'child_process';
import { abortIfCancelled } from '../utils/clack-utils';
import { promisify } from 'util';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Platform } from '../../lib/Constants';

const nodePath = process.execPath;
const reactNativeCommunityCliPath = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  'react-native',
);
let expoCliPath: string | undefined = undefined;
try {
  expoCliPath = require.resolve('@expo/cli', {
    paths: [
      require.resolve('expo/package.json', {
        paths: [process.cwd()],
      }),
    ],
  });
} catch (e) {
  // Ignore
}
const nodeModulesHermesCompilerPath = path.join(
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
const podMobileHermesCompilerPath = path.join(
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
const packageJsonPath = path.join(process.cwd(), 'package.json');
const defaultOutputDirName = 'dist/_sentry';
const defaultOutputDirPath = path.join(process.cwd(), defaultOutputDirName);

const spinner: ReturnType<typeof clack.spinner> = clack.spinner();

type ReactNativeCliArgs = {
  dryRun: boolean;
  verbose: boolean;
  platform: ('android' | 'ios')[];
  output: string;
  disableTelemetry: boolean;
  packagerArgs: string[];
  hermesArgs: string[];
};

export function runReactNativeCli(): void {
  const options = yargs(hideBin(process.argv))
    .command<ReactNativeCliArgs>(
      'react-native-cli <command>',
      "Welcome to Sentry's React Native CLI",
      (yargs) => {
        yargs.command(
          'export',
          'Export bundle and source maps which are embedded by React Native during native application build.',
          (yargs) =>
            yargs
              .option('platform', {
                choices: Object.keys(Platform),
                describe:
                  'Select platform(s) for which you want to export the bundle and source maps.',
                default: [Platform.android, Platform.ios],
                alias: 'p',
                type: 'array',
              })
              .option('dryRun', {
                describe: 'Print the commands that would be run.',
                default: false,
                type: 'boolean',
              })
              .option('verbose', {
                alias: 'v',
                describe: 'Enable verbose logging.',
                default: false,
                type: 'boolean',
              })
              .option('output', {
                alias: 'o',
                describe: 'Output directory for the generated files.',
                default: defaultOutputDirName,
                type: 'string',
              })
              .option('disable-telemetry', {
                describe: 'Disable telemetry.',
                default: false,
                type: 'boolean',
              })
              .option('packager-args', {
                describe:
                  'Additional arguments to pass to the package manager command.',
                default: [],
                type: 'array',
              })
              .option('hermes-args', {
                describe:
                  'Additional arguments to pass to the Hermes compiler command.',
                default: [],
                type: 'array',
              }),
        );
        return yargs;
      },
    )
    .help().argv;
  void withTelemetry(
    {
      enabled: !options.disableTelemetry,
      integration: 'sourcemaps',
    },
    () =>
      runReactNativeCliWithTelemetry(options as unknown as ReactNativeCliArgs),
  );
}

async function runReactNativeCliWithTelemetry(
  options: ReactNativeCliArgs,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry React Native CLI',
    message: `This command line tool will help you generate React Native bundle and source maps.
Thank you for using Sentry :)${
      !options.disableTelemetry
        ? `

(This tool sends telemetry data and crash reports to Sentry.
You can turn this off by running the wizard with the '--disable-telemetry' flag.)`
        : ''
    }`,
  });

  let packageJson: {
    main?: unknown;
  } = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (e) {
    // Ignore
  }

  let appJson: {
    expo?: {
      jsEngine?: 'hermes' | 'jsc';
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

  const runsOnAppleDesktop = process.platform === 'darwin';
  const selectedPlatforms = options.platform;

  const isAppleMobile =
    selectedPlatforms.includes('ios') &&
    (fs.existsSync(path.join(process.cwd(), 'ios')) || appJson?.expo?.ios);
  const isAndroidMobile =
    selectedPlatforms.includes('android') &&
    (fs.existsSync(path.join(process.cwd(), 'android')) ||
      appJson?.expo?.android);

  const likelyExpo = !!appJson?.expo;

  const hasHermesEnabledInAppJson = appJson?.expo?.jsEngine === 'hermes';

  let hasHermesEnabledInGradleProperties: boolean | undefined = undefined;
  try {
    const gradleProperties = fs.readFileSync(gradlePropertiesPath, 'utf8');
    hasHermesEnabledInGradleProperties =
      /(^|\n)(react\.)?hermesEnabled=true/.test(gradleProperties);
  } catch (e) {
    // Ignore
  }
  if (hasHermesEnabledInGradleProperties === undefined && !likelyExpo) {
    clack.log.warn(
      'Seems like your `android/gradle.properties` file is missing. Are you in your React Native project root directory? Confider adding the properties file and then try again.',
    );
    await confirmContinue();
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
    hasHermesEnabledInGradleProperties = doYouUseHermesAndroid;
  }

  let hasHermesPodsInstalled: boolean | undefined = undefined;
  try {
    const podFileLock = fs.readFileSync(appleMobilePodFileLockPath, 'utf8');
    hasHermesPodsInstalled = podFileLock.includes('hermes-engine:');
  } catch (e) {
    // Ignore
  }
  if (
    hasHermesPodsInstalled === undefined &&
    runsOnAppleDesktop &&
    !likelyExpo
  ) {
    clack.log.warn(
      'Seems like you `ios/Pods` directory is missing lock file. Consider running `pod install` and then try again.',
    );
    await confirmContinue();
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
    hasHermesPodsInstalled = !!doYouUseHermesApple;
  }

  if (likelyExpo) {
    clack.log.info('Detected project with Expo configuration.');
  } else {
    clack.log.info('Detected project with bare React Native.');
  }
  if (isAndroidMobile) {
    if (hasHermesEnabledInAppJson || hasHermesEnabledInGradleProperties) {
      clack.log.info('Detected Android project with Hermes enabled.');
    } else {
      clack.log.info('Detected Android project with JavaScript Core enabled.');
    }
  }

  if (isAppleMobile) {
    if (hasHermesEnabledInAppJson || hasHermesPodsInstalled) {
      clack.log.info('Detected iOS project with Hermes enabled.');
    } else {
      clack.log.info('Detected iOS project with JavaScript Core enabled.');
    }
  }

  if (isAppleMobile && !runsOnAppleDesktop) {
    clack.log.warn(
      "You are on a non-Apple platform, but you have an iOS project, the iOS bundle won't be generated.",
    );
  }

  let entryFilePath = defaultEntryFilePath;
  if (typeof packageJson.main === 'string') {
    let maybeMainPath: string | undefined = path.join(
      process.cwd(),
      packageJson.main,
    );
    if (!fs.existsSync(maybeMainPath)) {
      maybeMainPath = undefined;
    }

    let maybeResolvedMainPath: string | undefined = undefined;
    try {
      maybeResolvedMainPath = require.resolve(packageJson.main, {
        paths: [process.cwd()],
      });
    } catch (e) {
      // Ignore
    }

    entryFilePath = maybeMainPath || maybeResolvedMainPath || entryFilePath;
  }

  if (fs.existsSync(entryFilePath)) {
    clack.log.info(`Detected entry file: ${chalk.cyan(entryFilePath)}`);
  } else {
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

  // Last check before creating files
  const doesUserWantContinue = await abortIfCancelled(
    clack.confirm({
      message: 'Do you want to proceed?',
      initialValue: true,
    }),
  );
  if (!doesUserWantContinue) {
    await abort();
  }

  const outputDirPath =
    options.output !== defaultOutputDirName
      ? path.isAbsolute(options.output)
        ? path.resolve(options.output)
        : path.join(process.cwd(), path.resolve(options.output))
      : defaultOutputDirPath;

  if (isAndroidMobile) {
    await exportPlatform({
      platform: 'android',
      hermesEnabled:
        hasHermesEnabledInAppJson || !!hasHermesEnabledInGradleProperties,
      bundleName: 'index.android.bundle',
      entryPath: entryFilePath,
      outputDirPath,
      packagerArgs: options.packagerArgs,
      hermesArgs: options.hermesArgs,
    });
  }

  if (isAppleMobile && runsOnAppleDesktop) {
    await exportPlatform({
      platform: 'ios',
      hermesEnabled: hasHermesEnabledInAppJson || !!hasHermesPodsInstalled,
      bundleName: 'index.ios.bundle',
      entryPath: entryFilePath,
      outputDirPath,
      packagerArgs: options.packagerArgs,
      hermesArgs: options.hermesArgs,
    });
  }

  clack.outro(`All done! 🎉`);

  async function exportPlatform({
    platform,
    bundleName,
    entryPath,
    outputDirPath,
    hermesEnabled,
    packagerArgs,
    hermesArgs,
  }: {
    platform: 'android' | 'ios';
    bundleName: string;
    entryPath: string;
    outputDirPath: string;
    hermesEnabled: boolean;
    packagerArgs: string[];
    hermesArgs: string[];
  }) {
    const label = platformToLabel(platform);
    const bundleStartMessage = `Generating ${label} packager bundle and source maps...`;
    options.verbose
      ? clack.log.step(bundleStartMessage)
      : spinner.start(bundleStartMessage);

    const packagerBundlePath = path.join(
      outputDirPath,
      platform,
      'packager',
      bundleName,
    );
    const packagerMapPath = path.join(
      outputDirPath,
      platform,
      'packager',
      bundleName + '.map',
    );

    await bundle({
      platform: 'android',
      bundlePath: packagerBundlePath,
      mapPath: packagerMapPath,
      entryPath,
      packagerArgs,
    });

    const bundleStopMessage = `${label} packager bundle and source maps generated.`;
    options.verbose
      ? clack.log.success(bundleStopMessage)
      : spinner?.stop(bundleStopMessage);

    clack.log.info(
      `${label} packager bundle saved to: ${chalk.cyan(packagerBundlePath)}`,
    );
    clack.log.info(
      `${label} packager source map saved to: ${chalk.cyan(packagerMapPath)}`,
    );

    if (!hermesEnabled) {
      await checkUsageOfDebugIds(packagerMapPath);
      return undefined;
    }

    const startHermesMessage = `Compiling ${label} Hermes bundle and source maps...`;
    options.verbose
      ? clack.log.step(startHermesMessage)
      : spinner.start(startHermesMessage);

    const hermesBundlePath = path.join(
      outputDirPath,
      platform,
      'hermes',
      'index.android.bundle',
    );
    const hermesMapPath = hermesBundlePath + '.map';
    await promisify(fs.mkdir)(path.dirname(hermesBundlePath), {
      recursive: true,
    });

    await compile({
      platform,
      packagerBundlePath,
      packagerMapPath,
      hermesBundlePath,
      hermesMapPath,
      hermesArgs,
    });

    const stopHermesMessage = `${label} Hermes bundle and source maps compiled.`;
    options.verbose
      ? clack.log.success(stopHermesMessage)
      : spinner?.stop(stopHermesMessage);

    clack.log.info(
      `${label} Hermes bundle saved to: ${chalk.cyan(hermesBundlePath)}`,
    );
    clack.log.info(
      `${label} Hermes source map saved to: ${chalk.cyan(hermesMapPath)}`,
    );

    await checkUsageOfDebugIds(hermesMapPath);
  }

  async function bundle({
    platform,
    bundlePath,
    mapPath,
    entryPath,
    packagerArgs,
  }: {
    platform: 'android' | 'ios';
    bundlePath: string;
    mapPath: string;
    entryPath: string;
    packagerArgs: string[];
  }) {
    await execute(
      expoCliPath || reactNativeCommunityCliPath,
      [
        expoCliPath ? 'export:embed' : 'bundle',
        '--dev',
        'false',
        '--minify',
        'false',
        '--platform',
        platform,
        '--entry-file',
        entryPath,
        '--reset-cache',
        '--bundle-output',
        bundlePath,
        '--sourcemap-output',
        mapPath,
        ...packagerArgs,
      ],
      options,
    );
  }

  async function compile({
    platform,
    packagerBundlePath,
    packagerMapPath,
    hermesBundlePath,
    hermesMapPath,
    hermesArgs,
  }: {
    platform: 'android' | 'ios';
    packagerBundlePath: string;
    packagerMapPath: string;
    hermesBundlePath: string;
    hermesMapPath: string;
    hermesArgs: string[];
  }) {
    // Compile Hermes bundle
    await execute(
      platform === 'ios' && fs.existsSync(podMobileHermesCompilerPath)
        ? podMobileHermesCompilerPath
        : nodeModulesHermesCompilerPath,
      [
        '-O',
        '-emit-binary',
        '-output-source-map',
        `-out=${hermesBundlePath}`,
        packagerBundlePath,
        ...hermesArgs,
      ],
      options,
    );

    const intermediateHermesMap = hermesBundlePath + 'hbc.map';
    fs.renameSync(hermesBundlePath + '.map', intermediateHermesMap);

    // Compose source maps
    await execute(
      nodePath,
      [
        composeSourceMapsPath,
        packagerMapPath,
        intermediateHermesMap,
        '-o',
        hermesMapPath,
      ],
      options,
    );

    // Copy Debug ID
    const from = await fs.promises.readFile(packagerMapPath, 'utf8');
    const to = await fs.promises.readFile(hermesMapPath, 'utf8');

    const fromParsed = JSON.parse(from) as SourceMapWithDebugId;
    const toParsed = JSON.parse(to) as SourceMapWithDebugId;

    if (!fromParsed.debugId && !fromParsed.debug_id) {
      return undefined;
    }

    const debugId =
      toParsed.debugId ||
      toParsed.debug_id ||
      fromParsed.debugId ||
      fromParsed.debug_id;

    toParsed.debugId = debugId;
    toParsed.debug_id = debugId;

    await fs.promises.writeFile(hermesMapPath, JSON.stringify(toParsed));
  }
}

type SourceMapWithDebugId = {
  debugId?: string;
  debug_id?: string;
};

async function checkUsageOfDebugIds(finalMapPath: string): Promise<void> {
  const map = await fs.promises.readFile(finalMapPath, 'utf8');
  const parsedMap = JSON.parse(map) as SourceMapWithDebugId;
  if (!parsedMap.debugId && !parsedMap.debug_id) {
    clack.note(
      `The final bundle and source map at ${chalk.cyan(
        finalMapPath,
      )} does not contain Debug ID. This is not an issue, but it's recommended to include Debug ID in your output
to improve symbolication of error and avoid potential issues with incorrect source maps.

Learn more about Debug IDs and how to use them: ${chalk.cyan(
        'https://docs.sentry.io/platforms/react-native/manual-setup/metro/',
      )}`,
    );
  }
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
      `command: ${bin} ${args.join(
        ' ',
      )}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
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

async function confirmContinue() {
  const confirmContinue = await abortIfCancelled(
    clack.confirm({
      message: 'Do you want to continue anyway?',
      initialValue: false,
    }),
  );
  !confirmContinue && (await abort());
}

function platformToLabel(platform: 'android' | 'ios') {
  return platform === 'android' ? 'Android' : 'iOS';
}
