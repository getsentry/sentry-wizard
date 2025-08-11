// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

import * as Sentry from '@sentry/node';

import { traceStep, withTelemetry } from '../telemetry';
import {
  abort,
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
  askShouldCreateExamplePage,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  printWelcome,
  runPrettierIfInstalled,
  showCopyPasteInstructions,
} from '../utils/clack';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { NPM } from '../utils/package-manager';
import type { WizardOptions } from '../utils/types';
import { createExamplePage } from './sdk-example';
import { createOrMergeSvelteKitFiles, loadSvelteConfig } from './sdk-setup';
import { getKitVersionBucket, getSvelteVersionBucket } from './utils';

export async function runSvelteKitWizard(
  options: WizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'sveltekit',
      wizardOptions: options,
    },
    () => runSvelteKitWizardWithTelemetry(options),
  );
}

export async function runSvelteKitWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry SvelteKit Wizard',
    promoCode,
    telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, '@sveltejs/kit', 'Sveltekit');

  const kitVersion = getPackageVersion('@sveltejs/kit', packageJson);
  const kitVersionBucket = getKitVersionBucket(kitVersion);
  Sentry.setTag('sveltekit-version', kitVersionBucket);

  if (kitVersionBucket === '0.x') {
    clack.log.warn(
      "It seems you're using a SvelteKit version <1.0.0 which is not supported by Sentry.\nWe recommend upgrading to the latest 1.x version before you continue.",
    );
    const shouldContinue = await abortIfCancelled(
      clack.select({
        message: 'Do you want to continue anyway?',
        options: [
          {
            label: 'Yes, continue',
            hint: 'The SDK might not work correctly',
            value: true,
          },
          { label: "No, I'll upgrade first", value: false },
        ],
      }),
    );
    if (!shouldContinue) {
      await abort('Exiting Wizard', 0);
      return;
    }
  }

  Sentry.setTag(
    'svelte-version',
    getSvelteVersionBucket(getPackageVersion('svelte', packageJson)),
  );

  const { selectedProject, selfHosted, sentryUrl, authToken } =
    await getOrAskForProjectData(options, 'javascript-sveltekit');

  const sdkAlreadyInstalled = hasPackageInstalled(
    '@sentry/sveltekit',
    packageJson,
  );
  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  await installPackage({
    packageName: '@sentry/sveltekit@^10',
    packageNameDisplayLabel: '@sentry/sveltekit',
    alreadyInstalled: sdkAlreadyInstalled,
    forceInstall,
  });

  await addDotEnvSentryBuildPluginFile(authToken);

  const svelteConfig = await traceStep('load-svelte-config', loadSvelteConfig);

  try {
    await traceStep('configure-sdk', () =>
      createOrMergeSvelteKitFiles(
        {
          dsn: selectedProject.keys[0].dsn.public,
          org: selectedProject.organization.slug,
          project: selectedProject.slug,
          selfHosted,
          url: sentryUrl,
        },
        svelteConfig,
      ),
    );
  } catch (e: unknown) {
    clack.log.error('Error while setting up the SvelteKit SDK:');
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );
    Sentry.captureException('Error while setting up the SvelteKit SDK');
    await abort('Exiting Wizard');
    return;
  }

  const shouldCreateExamplePage = await askShouldCreateExamplePage(
    '/sentry-example-page',
  );

  if (shouldCreateExamplePage) {
    try {
      await traceStep('create-example-page', () =>
        createExamplePage(svelteConfig, {
          selfHosted,
          url: sentryUrl,
          orgSlug: selectedProject.organization.slug,
          projectId: selectedProject.id,
        }),
      );
    } catch (e: unknown) {
      clack.log.error('Error while creating an example page to test Sentry:');
      clack.log.info(
        chalk.dim(
          typeof e === 'object' && e != null && 'toString' in e
            ? e.toString()
            : typeof e === 'string'
            ? e
            : 'Unknown error',
        ),
      );
      Sentry.captureException(
        'Error while creating an example Svelte page to test Sentry',
      );
      await abort('Exiting Wizard');
      return;
    }
  }

  await runPrettierIfInstalled({ cwd: undefined });

  // Offer optional project-scoped MCP config for Sentry
  await offerProjectScopedMcpConfig();

  clack.outro(await buildOutroMessage(shouldCreateExamplePage));
}

async function buildOutroMessage(
  shouldCreateExamplePage: boolean,
): Promise<string> {
  const packageManager = await getPackageManager(NPM);

  let msg = chalk.green('\nSuccessfully installed the Sentry SvelteKit SDK!');

  if (shouldCreateExamplePage) {
    msg += `\n\nYou can validate your setup by starting your dev environment (${chalk.cyan(
      `\`${packageManager.runScriptCommand} dev\``,
    )}) and visiting ${chalk.cyan('"/sentry-example-page"')}.`;
  }

  msg += `\n\nCheck out the SDK documentation for further configuration:
https://docs.sentry.io/platforms/javascript/guides/sveltekit/`;

  return msg;
}

/**
 * Offers to add a project-scoped MCP server configuration for the Sentry MCP.
 * Supports Cursor, VS Code, and Claude Code.
 */
async function offerProjectScopedMcpConfig(): Promise<void> {
  const shouldAdd = await abortIfCancelled(
    clack.select({
      message:
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false, hint: 'You can add it later anytime' },
      ],
      initialValue: true,
    }),
  );

  if (!shouldAdd) {
    return;
  }

  type EditorChoice = 'cursor' | 'vscode' | 'claudeCode';
  const editor: EditorChoice = await abortIfCancelled(
    clack.select({
      message: 'Which editor do you want to configure?',
      options: [
        { value: 'cursor', label: 'Cursor (project .cursor/mcp.json)' },
        { value: 'vscode', label: 'VS Code (project .vscode/mcp.json)' },
        { value: 'claudeCode', label: 'Claude Code (project .mcp.json)' },
      ],
    }),
  );

  try {
    switch (editor) {
      case 'cursor':
        await addCursorMcpConfig();
        break;
      case 'vscode':
        await addVsCodeMcpConfig();
        break;
      case 'claudeCode':
        await addClaudeCodeMcpConfig();
        break;
    }

    clack.log.success('Added project-scoped Sentry MCP configuration.');
    clack.log.info(
      chalk.dim(
        'Note: You may need to reload your editor for MCP changes to take effect.',
      ),
    );
  } catch (e) {
    clack.log.warn(
      chalk.yellow(
        'Failed to write MCP config automatically. Please copy/paste the snippet below into your project config file.',
      ),
    );
    // Fallback: show per-editor instructions
    if (editor === 'cursor') {
      await showCopyPasteInstructions({
        filename: path.join('.cursor', 'mcp.json'),
        codeSnippet: getCursorMcpJsonSnippet(),
        hint: 'create the file if it does not exist',
      });
    } else if (editor === 'vscode') {
      await showCopyPasteInstructions({
        filename: path.join('.vscode', 'mcp.json'),
        codeSnippet: getVsCodeMcpJsonSnippet(),
        hint: 'create the file if it does not exist',
      });
    } else {
      await showCopyPasteInstructions({
        filename: '.mcp.json',
        codeSnippet: getClaudeCodeMcpJsonSnippet(),
        hint: 'create the file if it does not exist',
      });
    }
  }
}

const SENTRY_MCP_URL = 'https://mcp.sentry.dev/mcp';

function ensureDir(dirpath: string): void {
  fs.mkdirSync(dirpath, { recursive: true });
}

async function readJsonIfExists(filepath: string): Promise<any | null> {
  try {
    const txt = await fs.promises.readFile(filepath, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function writeJson(filepath: string, obj: unknown): Promise<void> {
  ensureDir(path.dirname(filepath));
  await fs.promises.writeFile(filepath, JSON.stringify(obj, null, 2), 'utf8');
}

function getCursorMcpJsonSnippet(): string {
  const obj = {
    mcpServers: {
      Sentry: {
        url: SENTRY_MCP_URL,
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

function getVsCodeMcpJsonSnippet(): string {
  const obj = {
    servers: {
      Sentry: {
        url: SENTRY_MCP_URL,
        type: 'http',
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

function getClaudeCodeMcpJsonSnippet(): string {
  const obj = {
    mcpServers: {
      Sentry: {
        url: SENTRY_MCP_URL,
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

async function addCursorMcpConfig(): Promise<void> {
  const file = path.join(process.cwd(), '.cursor', 'mcp.json');
  const existing = await readJsonIfExists(file);
  if (!existing) {
    await writeJson(file, JSON.parse(getCursorMcpJsonSnippet()));
    clack.log.success(chalk.cyan(path.join('.cursor', 'mcp.json')) + ' created.');
    return;
  }
  try {
    const updated = { ...existing } as any;
    updated.mcpServers = updated.mcpServers || {};
    updated.mcpServers['Sentry'] = {
      url: SENTRY_MCP_URL,
    };
    await writeJson(file, updated);
    clack.log.success('Updated .cursor/mcp.json');
  } catch {
    throw new Error('Failed to update .cursor/mcp.json');
  }
}

async function addVsCodeMcpConfig(): Promise<void> {
  const file = path.join(process.cwd(), '.vscode', 'mcp.json');
  const existing = await readJsonIfExists(file);
  if (!existing) {
    await writeJson(file, JSON.parse(getVsCodeMcpJsonSnippet()));
    clack.log.success(chalk.cyan(path.join('.vscode', 'mcp.json')) + ' created.');
    return;
  }
  try {
    const updated = { ...existing } as any;
    updated.servers = updated.servers || {};
    updated.servers['Sentry'] = {
      url: SENTRY_MCP_URL,
      type: 'http',
    };
    await writeJson(file, updated);
    clack.log.success('Updated .vscode/mcp.json');
  } catch {
    throw new Error('Failed to update .vscode/mcp.json');
  }
}

async function addClaudeCodeMcpConfig(): Promise<void> {
  const file = path.join(process.cwd(), '.mcp.json');
  const existing = await readJsonIfExists(file);
  if (!existing) {
    await writeJson(file, JSON.parse(getClaudeCodeMcpJsonSnippet()));
    clack.log.success(chalk.cyan('.mcp.json') + ' created.');
    return;
  }
  try {
    const updated = { ...existing } as any;
    updated.mcpServers = updated.mcpServers || {};
    updated.mcpServers['Sentry'] = {
      url: SENTRY_MCP_URL,
    };
    await writeJson(file, updated);
    clack.log.success('Updated .mcp.json');
  } catch {
    throw new Error('Failed to update .mcp.json');
  }
}
