// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';
import * as path from 'path';
import * as fs from 'fs';
import {
  abortIfCancelled,
  addSentryCliConfig,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  artifactsExist,
  askWhatToDoNext,
} from '../../utils/clack';

import { SourceMapUploadToolConfigurationOptions } from './types';
import { hasPackageInstalled } from '../../utils/package-json';
import { traceStep } from '../../telemetry';
import { NPM } from '../../utils/package-manager';

const SENTRY_NPM_SCRIPT_NAME = 'sentry:sourcemaps';

let addedToBuildCommand = false;

type configureSentryCLIOptions = SourceMapUploadToolConfigurationOptions & {
  defaultArtifactPath?: string;
};

export async function configureSentryCLI(
  options: configureSentryCLIOptions,
  configureSourcemapGenerationFlow: () => Promise<void> = defaultConfigureSourcemapGenerationFlow,
  skipValidation = false,
): Promise<void> {
  const packageDotJson = await getPackageDotJson();

  await installPackage({
    packageName: '@sentry/cli',
    alreadyInstalled: hasPackageInstalled('@sentry/cli', packageDotJson),
  });

  let validPath = false;
  let relativeArtifactPath: string | undefined;
  do {
    const rawArtifactPath = await abortIfCancelled(
      clack.text({
        message: 'Where are your build artifacts located?',
        placeholder:
          relativeArtifactPath ??
          options.defaultArtifactPath ??
          `.${path.sep}out`,
        initialValue:
          relativeArtifactPath ??
          options.defaultArtifactPath ??
          `.${path.sep}out`,
        validate(value) {
          if (!value) {
            return 'Please enter a path.';
          }
        },
      }),
    );

    if (path.isAbsolute(rawArtifactPath)) {
      relativeArtifactPath = path.relative(process.cwd(), rawArtifactPath);
    } else {
      relativeArtifactPath = rawArtifactPath;
    }

    if (artifactsExist(relativeArtifactPath)) {
      validPath = true;
      continue;
    }

    const whatToDoNext = await askWhatToDoNext({ relativeArtifactPath });

    validPath = whatToDoNext?.validPath ?? false;
    relativeArtifactPath =
      whatToDoNext?.relativeArtifactPath ?? relativeArtifactPath;
  } while (!validPath);

  const relativePosixArtifactPath = relativeArtifactPath
    .split(path.sep)
    .join(path.posix.sep);

  if (!skipValidation) {
    await configureSourcemapGenerationFlow();
  }

  await createAndAddNpmScript(options, relativePosixArtifactPath);

  if (await askShouldAddToBuildCommand()) {
    await traceStep('sentry-cli-add-to-build-cmd', () =>
      addSentryCommandToBuildCommand(),
    );
  } else {
    clack.log.info(
      `No problem, just make sure to run this script ${chalk.bold(
        'after',
      )} building your application but ${chalk.bold('before')} deploying!`,
    );
  }

  await addSentryCliConfig({ authToken: options.authToken });
}

export async function setupNpmScriptInCI(): Promise<void> {
  if (addedToBuildCommand) {
    // No need to tell users to add it manually to their CI
    // if the script is already added to the build command
    return;
  }

  const addedToCI = await abortIfCancelled(
    clack.select({
      message: `Add a step to your CI pipeline that runs the ${chalk.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} script ${chalk.bold('right after')} building your application.`,
      options: [
        { label: 'I did, continue!', value: true },
        {
          label: "I'll do it later...",
          value: false,
          hint: chalk.yellow(
            `You need to run ${chalk.cyan(
              SENTRY_NPM_SCRIPT_NAME,
            )} after each build for source maps to work properly.`,
          ),
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('added-ci-script', addedToCI);

  if (!addedToCI) {
    clack.log.info("Don't forget! :)");
  }
}

async function createAndAddNpmScript(
  options: SourceMapUploadToolConfigurationOptions,
  relativePosixArtifactPath: string,
): Promise<void> {
  const sentryCliNpmScript = `sentry-cli sourcemaps inject --org ${
    options.orgSlug
  } --project ${
    options.projectSlug
  } ${relativePosixArtifactPath} && sentry-cli${
    options.selfHosted ? ` --url ${options.url}` : ''
  } sourcemaps upload --org ${options.orgSlug} --project ${
    options.projectSlug
  } ${relativePosixArtifactPath}`;

  const packageDotJson = await getPackageDotJson();

  packageDotJson.scripts = packageDotJson.scripts || {};
  packageDotJson.scripts[SENTRY_NPM_SCRIPT_NAME] = sentryCliNpmScript;

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(packageDotJson, null, 2),
  );

  clack.log.info(
    `Added a ${chalk.cyan(SENTRY_NPM_SCRIPT_NAME)} script to your ${chalk.cyan(
      'package.json',
    )}.`,
  );
}

async function askShouldAddToBuildCommand(): Promise<boolean> {
  const shouldAddToBuildCommand = await abortIfCancelled(
    clack.select({
      message: `Do you want to automatically run the ${chalk.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} script after each production build?`,
      options: [
        {
          label: 'Yes',
          value: true,
          hint: 'This will modify your prod build command',
        },
        { label: 'No', value: false },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('modify-build-command', shouldAddToBuildCommand);

  return shouldAddToBuildCommand;
}

/**
 * Add the sentry:sourcemaps command to the prod build command in the package.json
 * - Detect the user's build command
 * - Append the sentry:sourcemaps command to it
 *
 * @param packageDotJson The package.json which will be modified.
 */
export async function addSentryCommandToBuildCommand(): Promise<void> {
  const packageDotJson = await getPackageDotJson();
  // This usually shouldn't happen because earlier we added the
  // SENTRY_NPM_SCRIPT_NAME script but just to be sure
  packageDotJson.scripts = packageDotJson.scripts || {};

  const allNpmScripts = Object.keys(packageDotJson.scripts).filter(
    (s) => s !== SENTRY_NPM_SCRIPT_NAME,
  );

  const packageManager = await getPackageManager(NPM);

  // Heuristic to pre-select the build command:
  // Often, 'build' is the prod build command, so we favour it.
  // If it's not there, commands that include 'build' might be the prod build command.
  let buildCommand =
    typeof packageDotJson.scripts.build === 'string'
      ? 'build'
      : allNpmScripts.find((s) => s.toLocaleLowerCase().includes('build'));

  const isProdBuildCommand =
    !!buildCommand &&
    (await abortIfCancelled(
      clack.confirm({
        message: `Is ${chalk.cyan(
          `${packageManager.runScriptCommand} ${buildCommand}`,
        )} your production build command?`,
      }),
    ));

  if (allNpmScripts.length && (!buildCommand || !isProdBuildCommand)) {
    buildCommand = await abortIfCancelled(
      clack.select({
        message: `Which ${packageManager.name} command in your ${chalk.cyan(
          'package.json',
        )} builds your application for production?`,
        options: allNpmScripts
          .map((script) => ({
            label: script,
            value: script,
          }))
          .concat({ label: 'None of the above', value: 'none' }),
      }),
    );
  }

  if (!buildCommand || buildCommand === 'none') {
    clack.log.warn(
      `We can only add the ${chalk.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} script to another \`script\` in your ${chalk.cyan('package.json')}.
Please add it manually to your prod build command.`,
    );
    return;
  }

  const oldCommand = packageDotJson.scripts[buildCommand];
  if (!oldCommand) {
    // very unlikely to happen but nevertheless
    clack.log.warn(
      `\`${buildCommand}\` doesn't seem to be part of your package.json scripts`,
    );
    return;
  }

  const newCommand = `${oldCommand} && ${packageManager.runScriptCommand} ${SENTRY_NPM_SCRIPT_NAME}`;

  if (oldCommand.endsWith(SENTRY_NPM_SCRIPT_NAME)) {
    clack.log.info(
      `It seems like ${chalk.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} is already part of your ${chalk.cyan(
        buildCommand,
      )} command. Will not add it again.
Current command: ${chalk.dim(oldCommand)}
Would have injected: ${chalk.dim(newCommand)}`,
    );

    return;
  }

  packageDotJson.scripts[buildCommand] = newCommand;

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(packageDotJson, null, 2),
  );

  addedToBuildCommand = true;

  clack.log.info(
    `Added ${chalk.cyan(SENTRY_NPM_SCRIPT_NAME)} script to your ${chalk.cyan(
      buildCommand,
    )} command.`,
  );
}

async function defaultConfigureSourcemapGenerationFlow(): Promise<void> {
  await abortIfCancelled(
    clack.select({
      message: `Verify that your build tool is generating source maps. ${chalk.dim(
        '(Your build output folder should contain .js.map files after a build)',
      )}`,
      options: [{ label: 'I checked. Continue!', value: true }],
      initialValue: true,
    }),
  );
}
