// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';
import * as path from 'path';
import * as fs from 'fs';
import {
  abortIfCancelled,
  addSentryCliRc,
  detectPackageManager,
  getPackageDotJson,
  installPackage,
} from '../../utils/clack-utils';

import { SourceMapUploadToolConfigurationOptions } from './types';
import { hasPackageInstalled, PackageDotJson } from '../../utils/package-json';
import { traceStep } from '../../telemetry';

const SENTRY_NPM_SCRIPT_NAME = 'sentry:sourcemaps';

export async function configureSentryCLI(
  options: SourceMapUploadToolConfigurationOptions,
  configureSourcemapGenerationFlow: () => Promise<void> = defaultConfigureSourcemapGenerationFlow,
): Promise<void> {
  const packageDotJson = await getPackageDotJson();

  await installPackage({
    packageName: '@sentry/cli',
    alreadyInstalled: hasPackageInstalled('@sentry/cli', packageDotJson),
  });

  let validPath = false;
  let relativeArtifactPath;
  do {
    const rawArtifactPath = await abortIfCancelled(
      clack.text({
        message: 'Where are your build artifacts located?',
        placeholder: `.${path.sep}out`,
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

    try {
      await fs.promises.access(path.join(process.cwd(), relativeArtifactPath));
      validPath = true;
    } catch {
      validPath = await abortIfCancelled(
        clack.select({
          message: `We couldn't find artifacts at ${relativeArtifactPath}. Are you sure that this is the location that contains your build artifacts?`,
          options: [
            {
              label: 'No, let me verify.',
              value: false,
            },
            { label: 'Yes, I am sure!', value: true },
          ],
          initialValue: false,
        }),
      );
    }
  } while (!validPath);

  const relativePosixArtifactPath = relativeArtifactPath
    .split(path.sep)
    .join(path.posix.sep);

  await configureSourcemapGenerationFlow();

  await createAndAddNpmScript(
    packageDotJson,
    options,
    relativePosixArtifactPath,
  );

  await askShouldAddToBuildCommand(packageDotJson);

  await addSentryCliRc(options.authToken);
}

export async function setupNpmScriptInCI(): Promise<void> {
  const addedToCI = await abortIfCancelled(
    clack.select({
      message: `Ensure that your CI pipeline runs the ${chalk.cyan(
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
  packageDotJson: PackageDotJson,
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

async function askShouldAddToBuildCommand(packageDotJson: PackageDotJson) {
  const shouldAddToBuildCommand = await abortIfCancelled(
    clack.select({
      message: `Do you want to automatically run the ${chalk.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} script after each production build?`,
      options: [
        {
          label: 'Yes',
          value: true,
          hint: 'This will modify your prod build comamnd',
        },
        { label: 'No', value: false },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('modify-build-command', shouldAddToBuildCommand);

  if (shouldAddToBuildCommand) {
    await traceStep('sentry-cli-add-to-build-cmd', () =>
      addSentryCommandToBuildCommand(packageDotJson),
    );
  } else {
    clack.log.info(
      `No problem, just make sure to run this script ${chalk.bold(
        'after',
      )} building your application but ${chalk.bold('before')} deploying!`,
    );
  }
}

/**
 * Add the sentry:sourcemaps command to the prod build command in the package.json
 * - Detect the user's build command
 * - Append the sentry:sourcemaps command to it
 *
 * @param packageDotJson The package.json which will be modified.
 */
async function addSentryCommandToBuildCommand(
  packageDotJson: PackageDotJson,
): Promise<void> {
  // This usually shouldn't happen because earlier we added the
  // SENTRY_NPM_SCRIPT_NAME script but just to be sure
  packageDotJson.scripts = packageDotJson.scripts || {};

  let buildCommand = packageDotJson.scripts.build;
  let isProdBuildCommand = false;

  const pacMan = detectPackageManager() || 'npm';

  if (buildCommand) {
    isProdBuildCommand = await abortIfCancelled(
      clack.confirm({
        message: `Is ${chalk.cyan(
          `${pacMan} run build`,
        )} your production build command?`,
      }),
    );
  }

  const allNpmScripts = Object.keys(packageDotJson.scripts).filter(
    (s) => s !== SENTRY_NPM_SCRIPT_NAME,
  );

  if (allNpmScripts.length && (!buildCommand || !isProdBuildCommand)) {
    buildCommand = await abortIfCancelled(
      clack.select({
        message: `Which ${pacMan} command in your ${chalk.cyan(
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

  if (buildCommand === 'none') {
    clack.log.warn(
      `We can only add the ${chalk.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} script to another \`script\` in your ${chalk.cyan('package.json')}.
Please add it manually to your prod build command.`,
    );
    return;
  }

  packageDotJson.scripts[
    buildCommand
  ] = `${buildCommand} && ${pacMan} run ${SENTRY_NPM_SCRIPT_NAME}`;

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(packageDotJson, null, 2),
  );

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
