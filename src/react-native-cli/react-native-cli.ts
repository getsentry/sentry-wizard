// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { withTelemetry } from '../telemetry';
import { abort, printWelcome } from '../utils/clack-utils';
import { WizardOptions } from '../utils/types';
import * as childProcess from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { option } from 'yargs';

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

export async function runReactNativeCli(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'sourcemaps',
    },
    () => runReactNativeCliWithTelemetry(options),
  );
}

async function runReactNativeCliWithTelemetry(
  options: WizardOptions,
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

  const isDryRun = true;

  // const isMacos = process.platform === 'darwin';

  // const isAppleMobile = hasAppleMobile();
  // const isAndroidMobile = hasAndroidMobile();
  // const isBrowser = hasBrowserSupport();

  // const isHermes = usesHermes();
  // const isExpoCli = usesExpoCli();

  // const metroBundleSpinner = clack.spinner();
  // metroBundleSpinner.start(
  //   `Generating React Native bundle and source maps with Metro...`,
  // );
  clack.log.step('Generate packager bundle and source maps...');

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
      'index.js',
      '--reset-cache',
      '--bundle-output',
      'index.android.bundle',
      '--sourcemap-output',
      'index.android.bundle.map',
    ],
    {
      dryRun: isDryRun,
    },
  );
  // metroBundleSpinner.stop('React Native bundle and source maps generated.');
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

  clack.log.step('Compile Hermes bundle...');

  await execute(
    androidHermesCompilerPath,
    [
      '-W', // disable warnings
      '-O',
      '-emit-binary',
      '-output-source-map',
      '-out=index.android.bundle.hbc',
      'index.android.bundle',
    ],
    {
      dryRun: isDryRun,
    },
  );

  clack.log.success('Hermes compilation successful.');
  clack.log.step('Compose Hermes and Packager source maps...');

  await execute(
    nodePath,
    [
      composeSourceMapsPath,
      'index.android.bundle.map',
      'index.android.bundle.hbc.map',
      'dist/android/hermes/index.android.bundle.hbc.map',
    ],
    {
      dryRun: isDryRun,
    },
  );

  // await copyDebugId({
  //   packagerSourceMapPath: 'index.android.bundle.map',
  //   composedSourceMapPath: 'dist/android/hermes/index.android.bundle.hbc.map',
  // });

  clack.log.success('Hermes and Packager source maps composed.');
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
  try {
    await new Promise((resolve, reject) => {
      const hermesCompile = childProcess.spawn(bin, args, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      hermesCompile.stdout.on('data', (data) => {
        stdout += data;
      });
      hermesCompile.stderr.on('data', (data) => {
        stderr += data;
      });
      hermesCompile.on('close', (code) => {
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(stderr);
        }
      });
    });
  } catch (e) {
    // metroBundleSpinner.stop(
    //   'Generating React Native bundle and source maps with Metro failed.',
    // );
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
        'Encountered the following error during the compilation:',
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      )}\n\n${e}\n\n${chalk.dim(
        "The wizard has created a `sentry-react-native-cli-error-*.log` file. If you think this issue is caused by the Sentry wizard, create an issue on GitHub and include the log file's content:\nhttps://github.com/getsentry/sentry-wizard/issues",
      )}`,
    );
    await abort();
  }
}
