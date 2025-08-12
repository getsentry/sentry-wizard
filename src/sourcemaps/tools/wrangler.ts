// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import {
  abort,
  abortIfCancelled,
  addSentryCliConfig,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  showCopyPasteInstructions,
} from '../../utils/clack';
import { hasPackageInstalled } from '../../utils/package-json';
import { NPM } from '../../utils/package-manager';
import type { SourceMapUploadToolConfigurationOptions } from './types';
import path from 'path';
import fs from 'fs';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const SENTRY_NPM_SCRIPT_NAME = 'sentry:sourcemaps';

/**
 * only exported for testing
 */
export const DIST_DIR = path.join('.', 'dist');

export async function configureWrangler(
  options: SourceMapUploadToolConfigurationOptions,
) {
  clack.note(
    pc.whiteBright(
      `Configuring source maps upload with Cloudflare Wrangler requires the wizard to:
- Modify your deploy command to access source maps
- Set the SENTRY_RELEASE env var to identify source maps

Note: This setup may need additional configuration.
We recommend using Vite to build your worker instead, for an easier and more reliable setup.

Learn more about CloudFlare's Vite setup here:
${pc.underline(
  pc.cyan('https://developers.cloudflare.com/workers/vite-plugin/get-started/'),
)}

You can switch to Vite and re-run this wizard later.
Otherwise, let's proceed with the Wrangler setup.`,
    ),
    'Before we get started',
  );

  const proceed = await abortIfCancelled(
    clack.confirm({
      message: 'Do you want to proceed with the Wrangler setup?',
    }),
  );

  if (!proceed) {
    await abort(
      'Got it! You can switch to Vite and re-run this wizard later.',
      0,
    );
    return;
  }

  await installPackage({
    packageName: '@sentry/cli',
    alreadyInstalled: hasPackageInstalled(
      '@sentry/cli',
      await getPackageDotJson(),
    ),
    devDependency: true,
  });

  if (!(await askContinueIfHasSentrySourcemapsScript())) {
    return;
  }

  const deployCommand = await getDeployCommand();
  if (!deployCommand) {
    return;
  }

  const outDir = await getWranglerOutDir(deployCommand);

  await createAndAddSentrySourcemapsScript({ ...options, outDir });

  await writePostDeployCommand(deployCommand);

  await modifyDeployCommand(deployCommand, outDir);

  await addSentryCliConfig({ authToken: options.authToken });
}

async function createAndAddSentrySourcemapsScript(
  options: SourceMapUploadToolConfigurationOptions & { outDir: string },
) {
  const pkgJson = await getPackageDotJson();
  pkgJson.scripts = pkgJson.scripts ?? {};
  pkgJson.scripts[SENTRY_NPM_SCRIPT_NAME] = getSentryCliCommand(options);

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(pkgJson, null, 2),
  );

  clack.log.success(
    `Added a ${pc.cyan(SENTRY_NPM_SCRIPT_NAME)} script to your ${pc.cyan(
      'package.json',
    )}.`,
  );
}

/**
 * only exported for testing
 */
export function getSentryCliCommand(
  options: SourceMapUploadToolConfigurationOptions & { outDir: string },
) {
  const sentryCliOptions = options.selfHosted ? ` --url ${options.url}` : '';
  const orgAndProjectArgs = `--org=${options.orgSlug} --project=${options.projectSlug}`;

  const stripPrefixPath = `${options.outDir}${path.sep}..`;

  return [
    '_SENTRY_RELEASE=$(sentry-cli releases propose-version)',
    `sentry-cli${sentryCliOptions} releases new $_SENTRY_RELEASE ${orgAndProjectArgs}`,
    `sentry-cli${sentryCliOptions} sourcemaps upload ${orgAndProjectArgs} --release=$_SENTRY_RELEASE --strip-prefix '${stripPrefixPath}' ${options.outDir}`,
  ].join(' && ');
}

async function askContinueIfHasSentrySourcemapsScript(): Promise<boolean> {
  const pkgJson = await getPackageDotJson();

  pkgJson.scripts = pkgJson.scripts ?? {};

  if (pkgJson.scripts[SENTRY_NPM_SCRIPT_NAME]) {
    clack.log.warn(
      `The ${pc.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} script already exists in your ${pc.cyan('package.json')}.
This likely means that you already ran this wizard once.
If things don't work yet, try overwriting the script and continue with the wizard.`,
    );

    const overwrite = await abortIfCancelled(
      clack.select({
        message: 'Do you want to overwrite it?',
        options: [
          { label: 'Yes', value: true, hint: 'Overwrite the existing script' },
          { label: 'No', value: false, hint: 'This will exit the wizard' },
        ],
      }),
    );

    if (!overwrite) {
      return false;
    }
  }

  return true;
}

async function getDeployCommand(): Promise<string | undefined> {
  const pkgJson = await getPackageDotJson();
  const scripts = pkgJson.scripts ?? {};

  let deployCommand = Object.keys(scripts).find((key) =>
    /wrangler\s+deploy/.test(scripts[key] ?? ''),
  );

  const packageManager = await getPackageManager(NPM);
  const isDeployCommand =
    !!deployCommand &&
    (await abortIfCancelled(
      clack.confirm({
        message: `Is ${pc.cyan(
          `${packageManager.runScriptCommand} ${deployCommand}`,
        )} your build and deploy command?`,
      }),
    ));

  if (Object.keys(scripts).length && (!deployCommand || !isDeployCommand)) {
    deployCommand = await abortIfCancelled(
      clack.select({
        message: `Which ${packageManager.name} command in your ${pc.cyan(
          'package.json',
        )} builds your worker and deploys it?`,
        options: Object.keys(scripts)
          .map((script) => ({
            label: script,
            value: script,
          }))
          .concat({ label: 'None of the above', value: 'none' }),
      }),
    );
  }

  if (!deployCommand || deployCommand === 'none') {
    clack.log.warn(
      `We can only add the ${pc.cyan(
        SENTRY_NPM_SCRIPT_NAME,
      )} script to another \`script\` in your ${pc.cyan('package.json')}.
Please add it manually to your prod build command.`,
    );
    return undefined;
  }

  return deployCommand;
}

async function writePostDeployCommand(deployCommand: string): Promise<void> {
  const pkgJson = await getPackageDotJson();
  const packageManager = await getPackageManager(NPM);
  pkgJson.scripts = pkgJson.scripts ?? {};
  pkgJson.scripts[
    `post${deployCommand}`
  ] = `${packageManager.runScriptCommand} ${SENTRY_NPM_SCRIPT_NAME}`;

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(pkgJson, null, 2),
  );

  clack.log.success(
    `Added a ${pc.cyan(`post${deployCommand}`)} script to your ${pc.cyan(
      'package.json',
    )}.`,
  );
}

async function modifyDeployCommand(
  deployCommand: string,
  outDir: string,
): Promise<void> {
  const pkgJson = await getPackageDotJson();
  pkgJson.scripts = pkgJson.scripts ?? {};
  const oldDeployCommand = pkgJson.scripts[deployCommand];

  if (!oldDeployCommand) {
    clack.log.warn(
      `The ${pc.cyan(
        deployCommand,
      )} script doesn't seem to be part of your package.json scripts anymore. Cannot modify it. Please modify it manually:`,
    );

    await showCopyPasteInstructions({
      codeSnippet: `wrangler deploy --outdir ${outDir} --var SENTRY_RELEASE:$(sentry-cli releases propose-version) --upload-source-maps`,
      filename: 'package.json',
    });

    return;
  }

  const newDeployCommand = safeInsertArgsToWranglerDeployCommand(
    oldDeployCommand,
    outDir,
  );

  if (!newDeployCommand) {
    clack.log.warn(
      `The ${pc.cyan(
        deployCommand,
      )} script doesn't seem to be a valid ${pc.cyan(
        'wrangler deploy',
      )} command. Cannot modify it. Please modify it manually:`,
    );

    await showCopyPasteInstructions({
      codeSnippet: oldDeployCommand,
      filename: 'package.json',
    });

    return;
  }

  pkgJson.scripts[deployCommand] = newDeployCommand;

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(pkgJson, null, 2),
  );

  clack.log.success(
    `Modified your ${pc.cyan(
      deployCommand,
    )} script to enable uploading source maps.`,
  );
}

/**
 * Takes care of inserting the necessary arguments into the deploy command.
 * Ensures that existing arguments and values are kept and that the
 * wrangler deploy command is valid.
 *
 * only exported for testing
 */
export function safeInsertArgsToWranglerDeployCommand(
  deployCommand: string,
  outDir: string,
): string | undefined {
  // split deployCommand into individual bash commands (potentially separated by &&, ||, >> etc.)
  const originalWranglerDeployCommand = getWranglerDeployCommand(deployCommand);

  if (!originalWranglerDeployCommand) {
    return undefined;
  }

  const existingArgs = originalWranglerDeployCommand
    .split(' ')
    .map((arg) => arg.trim())
    .filter(Boolean);

  const parsedArgs = yargs(hideBin(existingArgs)).parse();

  const newArgs = [];

  if (!parsedArgs.outdir) {
    newArgs.push('--outdir', outDir);
  }

  // Adding --upload-source-maps saves us from having to
  // modify the `wrangler.toml` or `wrangler.jsonc` files.
  // Not ideal because this forces source maps to be uploaded
  // but we'll live with it for now.
  if (!parsedArgs['upload-source-maps']) {
    newArgs.push('--upload-source-maps');
  }

  // This is how we inject the SENTRY_RELEASE variable,
  // which is picked up by the CloudFlare SDK.
  // multiple --var arguments are allowed, so no need to check for existing --var arguments.
  newArgs.push(
    '--var',
    'SENTRY_RELEASE:$(sentry-cli releases propose-version)',
  );

  return deployCommand
    .replace(
      originalWranglerDeployCommand,
      `${originalWranglerDeployCommand} ${newArgs.join(' ')} `,
    )
    .trim();
}

/**
 * Look up an already specified --outdir argument and return it if found.
 * Otherwise, we defined `dist` as the default outdir.
 */
async function getWranglerOutDir(deployScript: string): Promise<string> {
  const pkgJson = await getPackageDotJson();
  const scripts = pkgJson.scripts ?? {};
  const deployCommand = scripts[deployScript];

  if (!deployCommand) {
    return DIST_DIR;
  }

  return findOutDir(deployCommand);
}

/**
 * only exported for testing
 */
export function findOutDir(deployCommand: string): string {
  const args = getWranglerDeployCommand(deployCommand)
    ?.split(' ')
    .map((arg) => arg.trim());

  if (!args) {
    return DIST_DIR;
  }

  const outDirArgIndex = args.findIndex((arg) => arg.startsWith('--outdir'));
  if (outDirArgIndex === -1) {
    return DIST_DIR;
  }

  const outDirArg = args[outDirArgIndex];

  if (outDirArg.startsWith('--outdir=')) {
    return outDirArg.split('=')[1].trim().replace(/['"]/g, '');
  }

  const maybeOutDir = args[outDirArgIndex + 1];

  if (maybeOutDir && !maybeOutDir.startsWith('--')) {
    return maybeOutDir.replace(/['"]/g, '');
  }

  return DIST_DIR;
}

/**
 * Exported for testing
 */
export function getWranglerDeployCommand(deployCommand: string) {
  const individualCommands = deployCommand.split(/&&|\|\||>>|>|<|\||;/);

  const originalWranglerDeployCommand = individualCommands.find((cmd) => {
    const argv = cmd
      .split(' ')
      .map((arg) => arg.trim())
      .filter(Boolean);

    return argv[0] === 'wrangler' && argv.includes('deploy');
  });
  return originalWranglerDeployCommand;
}
