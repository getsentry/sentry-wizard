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
const appJsonPath = path.join(process.cwd(), 'app.json');
let expoCliPath: string | undefined = undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const likelyExpo = !!JSON.parse(fs.readFileSync(appJsonPath, 'utf8')).expo;

  if (likelyExpo) {
    // This is for monorepos include Expo and Bare projects
    expoCliPath = require.resolve('@expo/cli', {
      paths: [
        require.resolve('expo/package.json', {
          paths: [process.cwd()],
        }),
      ],
    });
  }
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

let projectSentryCliPath: string | undefined = undefined;
try {
  projectSentryCliPath = require.resolve('@sentry/cli/bin/sentry-cli', {
    paths: [process.cwd()],
  });
} catch (e) {
  // Ignore
}
let bundledSentryCliPath: string | undefined = undefined;
try {
  bundledSentryCliPath = require.resolve('@sentry/cli/bin/sentry-cli', {
    paths: [__dirname],
  });
} catch (e) {
  // Ignore
}

const spinner: ReturnType<typeof clack.spinner> = clack.spinner();

type ReactNativeCliArgs = {
  dryRun: boolean;
  verbose: boolean;
  platform: ('android' | 'ios')[];
  output: string;
  disableTelemetry: boolean;
  packagerArgs: string[];
  hermesArgs: string[];
  ci: boolean;
  entryFile?: string;
  keepIntermediates: boolean;
  upload: boolean;
  project?: string;
  org?: string;
};

export function runReactNativeCli(): void {
  const options = yargs(hideBin(process.argv))
    .command<ReactNativeCliArgs>(
      'react-native-cli <command>',
      "Welcome to Sentry's React Native CLI",
      (yargs) => {
        yargs.command(
          'export',
          `Export bundle and source maps which are embedded by React Native during native application build.

Supports React Native 0.70 and above.
Supports Expo SDK 50 and above.`,
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
              })
              .option('ci', {
                describe: 'Run in CI mode.',
                default: false,
                type: 'boolean',
              })
              .option('entry-file', {
                describe: 'Path to the entry file.',
                type: 'string',
              })
              .option('keep-intermediates', {
                describe:
                  'Keep the intermediate files generated during the process.',
                default: false,
                type: 'boolean',
              })
              .option('upload', {
                describe: 'Upload the generated files to Sentry.',
                default: false,
                type: 'boolean',
              })
              .option('project', {
                describe: 'Sentry Project Slug',
                type: 'string',
              })
              .option('org', {
                describe: 'Sentry Organization Slug',
                type: 'string',
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
    async () => {
      try {
        await runReactNativeCliWithTelemetry(
          options as unknown as ReactNativeCliArgs,
        );
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const error = 'stack' in e ? e.stack : e;
        clack.log.error(
          `${chalk.red(
            'Encountered the following error:',
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          )}\n\n${error}\n\n${chalk.dim(
            `If you think this issue is caused by the Sentry wizard,
create an issue on GitHub:

${chalk.cyan('https://github.com/getsentry/sentry-wizard/issues')}`,
          )}`,
        );
        await abort();
      }
    },
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

  const runsInCI = options.ci ?? process.env.CI === 'true';
  options.verbose = options.verbose || runsInCI;

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
    if (runsInCI) {
      await abort();
    }
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
    if (runsInCI) {
      await abort();
    }
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
      if (!runsOnAppleDesktop) {
        clack.log.warn(
          `You are on a non-Apple platform, the iOS bundle will be generated,
but Hermes compiler from node_modules will be used instead of from Pods.`,
        );
      }
    } else {
      clack.log.info('Detected iOS project with JavaScript Core enabled.');
    }
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

    entryFilePath =
      options.entryFile ||
      maybeMainPath ||
      maybeResolvedMainPath ||
      entryFilePath;
  }

  if (fs.existsSync(entryFilePath)) {
    clack.log.info(`Detected entry file: ${chalk.cyan(entryFilePath)}`);
  } else {
    if (runsInCI) {
      clack.log.error(
        `Could not detect your entry file. Use the main field in your package.json or --entry-file flag to specify the entry file.`,
      );
      await abort();
    }
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
  const doesUserWantContinue =
    runsInCI ||
    (await abortIfCancelled(
      clack.confirm({
        message: 'Do you want to proceed?',
        initialValue: true,
      }),
    ));
  if (!doesUserWantContinue) {
    await abort();
  }

  const outputDirPath =
    options.output !== defaultOutputDirName
      ? path.isAbsolute(options.output)
        ? path.resolve(options.output)
        : path.join(process.cwd(), path.resolve(options.output))
      : defaultOutputDirPath;

  const toUpload: Artifact[] = [];

  if (isAndroidMobile) {
    const artifact = await exportPlatform({
      platform: 'android',
      hermesEnabled:
        hasHermesEnabledInAppJson || !!hasHermesEnabledInGradleProperties,
      bundleName: 'index.android.bundle',
      entryPath: entryFilePath,
      outputDirPath,
      packagerArgs: options.packagerArgs,
      hermesArgs: options.hermesArgs,
      keepIntermediates: options.keepIntermediates,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
    await checkUsageOfDebugIds(artifact.mapPath);
    toUpload.push(artifact);
  }

  if (isAppleMobile) {
    const artifact = await exportPlatform({
      platform: 'ios',
      hermesEnabled: hasHermesEnabledInAppJson || !!hasHermesPodsInstalled,
      bundleName: 'index.jsbundle',
      entryPath: entryFilePath,
      outputDirPath,
      packagerArgs: options.packagerArgs,
      hermesArgs: options.hermesArgs,
      keepIntermediates: options.keepIntermediates,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
    await checkUsageOfDebugIds(artifact.mapPath);
    toUpload.push(artifact);
  }

  if (!options.upload) {
    clack.outro(`All done! 🎉`);
    return;
  }

  for (const artifact of toUpload) {
    await upload({
      artifact,
      project: options.project,
      org: options.org,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
  }

  clack.outro(`All done and uploaded! 🎉`);
}

async function exportPlatform({
  platform,
  bundleName,
  entryPath,
  outputDirPath,
  hermesEnabled,
  packagerArgs,
  hermesArgs,
  keepIntermediates,
  dryRun,
  verbose,
}: {
  platform: 'android' | 'ios';
  bundleName: string;
  entryPath: string;
  outputDirPath: string;
  hermesEnabled: boolean;
  packagerArgs: string[];
  hermesArgs: string[];
  keepIntermediates: boolean;
  dryRun: boolean;
  verbose: boolean;
}): Promise<{
  bundlePath: string;
  mapPath: string;
}> {
  const label = platformToLabel(platform);
  const bundleStartMessage = `Generating ${label} packager bundle and source maps...`;
  verbose
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
    dryRun,
    verbose,
  });

  const bundleStopMessage = `${label} packager bundle and source maps generated.`;
  verbose
    ? clack.log.success(bundleStopMessage)
    : spinner?.stop(bundleStopMessage);

  if (keepIntermediates) {
    clack.log.info(
      `${label} packager bundle saved to: ${chalk.cyan(packagerBundlePath)}`,
    );
    clack.log.info(
      `${label} packager source map saved to: ${chalk.cyan(packagerMapPath)}`,
    );
  }

  if (!hermesEnabled) {
    return { bundlePath: packagerBundlePath, mapPath: packagerMapPath };
  }

  const startHermesMessage = `Compiling ${label} Hermes bundle and source maps...`;
  verbose
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
    cleanup: !keepIntermediates,
    dryRun,
    verbose,
  });

  if (!keepIntermediates && !dryRun) {
    fs.unlinkSync(packagerBundlePath);
    fs.unlinkSync(packagerMapPath);
  }

  const stopHermesMessage = `${label} Hermes bundle and source maps compiled.`;
  verbose
    ? clack.log.success(stopHermesMessage)
    : spinner?.stop(stopHermesMessage);

  clack.log.info(
    `${label} Hermes bundle saved to: ${chalk.cyan(hermesBundlePath)}`,
  );
  clack.log.info(
    `${label} Hermes source map saved to: ${chalk.cyan(hermesMapPath)}`,
  );

  return { bundlePath: hermesBundlePath, mapPath: hermesMapPath };
}

async function bundle({
  platform,
  bundlePath,
  mapPath,
  entryPath,
  packagerArgs,
  dryRun,
  verbose,
}: {
  platform: 'android' | 'ios';
  bundlePath: string;
  mapPath: string;
  entryPath: string;
  packagerArgs: string[];
  dryRun: boolean;
  verbose: boolean;
}) {
  await fs.promises.mkdir(path.dirname(bundlePath), { recursive: true });
  await fs.promises.mkdir(path.dirname(mapPath), { recursive: true });

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
    { dryRun, verbose },
  );
}

async function compile({
  platform,
  packagerBundlePath,
  packagerMapPath,
  hermesBundlePath,
  hermesMapPath,
  hermesArgs,
  cleanup,
  dryRun,
  verbose,
}: {
  platform: 'android' | 'ios';
  packagerBundlePath: string;
  packagerMapPath: string;
  hermesBundlePath: string;
  hermesMapPath: string;
  hermesArgs: string[];
  cleanup: boolean;
  dryRun: boolean;
  verbose: boolean;
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
    { dryRun, verbose },
  );

  const intermediateHermesMap = hermesBundlePath + '.hbc.map';
  !dryRun && fs.renameSync(hermesBundlePath + '.map', intermediateHermesMap);

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
    { dryRun, verbose },
  );

  if (cleanup && !dryRun) {
    fs.unlinkSync(intermediateHermesMap);
  }

  if (dryRun) {
    return;
  }

  // Copy Debug ID
  let fromParsed: SourceMapWithDebugId = {};
  let toParsed: SourceMapWithDebugId = {};
  try {
    const from = await fs.promises.readFile(packagerMapPath, 'utf8');
    const to = await fs.promises.readFile(hermesMapPath, 'utf8');

    fromParsed = JSON.parse(from) as SourceMapWithDebugId;
    toParsed = JSON.parse(to) as SourceMapWithDebugId;
  } catch (e) {
    // Ignore
  }

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

type SourceMapWithDebugId = {
  debugId?: string;
  debug_id?: string;
};

type Artifact = {
  bundlePath: string;
  mapPath: string;
};

async function checkUsageOfDebugIds(finalMapPath: string): Promise<void> {
  let parsedMap: SourceMapWithDebugId = {};
  try {
    const map = await fs.promises.readFile(finalMapPath, 'utf8');
    parsedMap = JSON.parse(map) as SourceMapWithDebugId;
  } catch (e) {
    // Ignore
    return undefined;
  }

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

async function upload({
  artifact,
  project,
  org,
  dryRun,
  verbose,
}: {
  artifact: Artifact;
  project: string | undefined;
  org: string | undefined;
  dryRun: boolean;
  verbose: boolean;
}) {
  const missing: string[] = [];
  if (!project) {
    missing.push('--project <sentry_project_slug>');
  }
  if (!org) {
    missing.push('--org <sentry_organization_slug>');
  }
  if (!process.env.SENTRY_AUTH_TOKEN) {
    missing.push('SENTRY_AUTH_TOKEN');
  }
  if (missing.length > 0 || !project || !org) {
    clack.log.error(
      `Failed upload to Sentry, missing required: ${missing.join(', ')}`,
    );
    await abort();
    return;
  }

  if (!projectSentryCliPath && !bundledSentryCliPath) {
    clack.log.error(
      `Failed upload to Sentry, could not find Sentry CLI. Add ${chalk.cyan(
        '@sentry/cli',
      )} to your project.`,
    );
    await abort();
  }

  const startMessage = `Uploading to Sentry ${chalk.cyan(artifact.mapPath)}...`;
  verbose ? clack.log.step(startMessage) : spinner.start(startMessage);
  await execute(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    projectSentryCliPath! || bundledSentryCliPath!,
    [
      'sourcemaps',
      'upload',
      '--org',
      org,
      '--project',
      project,
      '--debug-id-reference',
      '--strip-prefix',
      process.cwd(),
      artifact.bundlePath,
      artifact.mapPath,
    ],
    { dryRun, verbose },
  );

  const endMessage = `Uploaded to Sentry ${chalk.cyan(artifact.mapPath)}.`;
  verbose ? clack.log.success(endMessage) : spinner.stop(endMessage);
}

async function execute(
  bin: string,
  args: string[],
  options: {
    verbose?: boolean;
    dryRun?: boolean;
  },
): Promise<void> {
  if (options.verbose || options.dryRun) {
    process.stdout.write(`\nCommand:\n${bin} ${args.join(' \\\n  ')}\n\n`);
  }

  if (options.dryRun) {
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
        `The CLI has created a ${chalk.cyan(
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
