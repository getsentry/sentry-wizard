// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_URL } from '../../lib/Constants';
import { configureVitePlugin } from '../sourcemaps/tools/vite';
import { traceStep, withTelemetry } from '../telemetry';
import { findFile } from '../utils/ast-utils';
import {
  addSentryCliConfig,
  abortIfCancelled,
  askShouldCreateExamplePage,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  rcCliSetupConfig,
  runPrettierIfInstalled,
  showCopyPasteInstructions,
} from '../utils/clack';
import { debug } from '../utils/debug';
import { hasPackageInstalled } from '../utils/package-json';
import type { WizardOptions } from '../utils/types';
import { createExamplePage } from './sdk-example';
import {
  createServerInstrumentationFile,
  initializeSentryOnEntryClient,
  insertServerInstrumentationFile,
  instrumentRootRoute,
  instrumentSentryOnEntryServer,
  isRemixV2,
  runRemixReveal,
  updateBuildScript,
  updateStartScript,
} from './sdk-setup';
import { isHydrogenApp } from './utils';

export async function runRemixWizard(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'remix',
      wizardOptions: options,
    },
    () => runRemixWizardWithTelemetry(options),
  );
}

async function runRemixWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry Remix Wizard',
    promoCode,
    telemetryEnabled,
  });

  const packageJson = await getPackageDotJson();

  if (!isRemixV2(packageJson)) {
    clack.log.error(
      `Sentry only supports Remix v2 and above. Please upgrade your Remix version to use Sentry.`,
    );
    return;
  }

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

  // We expect `@remix-run/dev` to be installed for every Remix project
  await ensurePackageIsInstalled(packageJson, '@remix-run/dev', 'Remix');

  const { selectedProject, authToken, sentryUrl, selfHosted } =
    await getOrAskForProjectData(options, 'javascript-remix');

  await installPackage({
    packageName: '@sentry/remix@^10',
    packageNameDisplayLabel: '@sentry/remix',
    alreadyInstalled: hasPackageInstalled('@sentry/remix', packageJson),
    forceInstall,
  });

  const dsn = selectedProject.keys[0].dsn.public;

  const isTS = isUsingTypeScript();
  const viteConfig = findFile('vite.config');
  const selectedFeatures = await featureSelectionPrompt([
    {
      id: 'performance',
      prompt: `Do you want to enable ${chalk.bold(
        'Tracing',
      )} to track the performance of your application?`,
      enabledHint: 'recommended',
    },
    {
      id: 'replay',
      prompt: `Do you want to enable ${chalk.bold(
        'Session Replay',
      )} to get a video-like reproduction of errors during a user session?`,
      enabledHint: 'recommended, but increases bundle size',
    },
    {
      id: 'logs',
      prompt: `Do you want to enable ${chalk.bold(
        'Logs',
      )} to send your application logs to Sentry?`,
      enabledHint: 'recommended',
    },
  ] as const);

  if (viteConfig) {
    await traceStep(
      'Update vite configuration for sourcemap uploads',
      async () => {
        try {
          await configureVitePlugin({
            orgSlug: selectedProject.organization.slug,
            projectSlug: selectedProject.slug,
            url: sentryUrl,
            selfHosted,
            authToken,
          });
        } catch (e) {
          clack.log
            .warn(`Could not update vite configuration to generate and upload sourcemaps.
    Please update your vite configuration manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/sourcemaps/`);
          debug(e);
        }
      },
    );
  } else {
    await traceStep('Update build script for sourcemap uploads', async () => {
      try {
        await updateBuildScript({
          org: selectedProject.organization.slug,
          project: selectedProject.slug,
          url: sentryUrl === DEFAULT_URL ? undefined : sentryUrl,
          isHydrogen: isHydrogenApp(packageJson),
        });

        await addSentryCliConfig({ authToken }, rcCliSetupConfig);
      } catch (e) {
        clack.log
          .warn(`Could not update build script to generate and upload sourcemaps.
  Please update your build script manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/sourcemaps/`);
        debug(e);
      }
    });
  }

  await traceStep('Instrument root route', async () => {
    try {
      await instrumentRootRoute(isTS);
    } catch (e) {
      clack.log.warn(`Could not instrument root route.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  traceStep('Reveal missing entry files', () => {
    try {
      runRemixReveal(isTS);
    } catch (e) {
      clack.log.warn(`Could not run 'npx remix reveal'.
  Please create your entry files manually`);
      debug(e);
    }
  });

  await traceStep('Initialize Sentry on client entry', async () => {
    try {
      await initializeSentryOnEntryClient(dsn, isTS, selectedFeatures);
    } catch (e) {
      clack.log.warn(`Could not initialize Sentry on client entry.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  let instrumentationFile = '';

  await traceStep('Create server instrumentation file', async () => {
    try {
      instrumentationFile = await createServerInstrumentationFile(
        dsn,
        selectedFeatures,
      );
    } catch (e) {
      clack.log.warn(
        'Could not create a server instrumentation file. Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/',
      );
      debug(e);
    }
  });

  let serverFileInstrumented = false;

  await traceStep(
    'Create server instrumentation file and import it',
    async () => {
      try {
        serverFileInstrumented = await insertServerInstrumentationFile(
          dsn,
          selectedFeatures,
        );
      } catch (e) {
        clack.log.warn(
          'Could not create a server instrumentation file. Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/',
        );
        debug(e);
      }
    },
  );

  if (!serverFileInstrumented && instrumentationFile) {
    await traceStep(
      'Update `start` script to import instrumentation file.',
      async () => {
        try {
          await updateStartScript(instrumentationFile);
        } catch (e) {
          clack.log
            .warn(`Could not automatically add Sentry initialization to server entry.
    Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
          debug(e);
        }
      },
    );
  }

  await traceStep('Instrument server `handleError`', async () => {
    try {
      await instrumentSentryOnEntryServer(isTS);
    } catch (e) {
      clack.log.warn(`Could not initialize Sentry on server entry.
  Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/`);
      debug(e);
    }
  });

  const shouldCreateExamplePage = await askShouldCreateExamplePage();

  if (shouldCreateExamplePage) {
    await traceStep('Create example page', async () => {
      await createExamplePage({
        isTS,
        selfHosted,
        orgSlug: selectedProject.organization.slug,
        projectId: selectedProject.id,
        url: sentryUrl,
      });
    });
  }

  await runPrettierIfInstalled({ cwd: undefined });

  // Offer optional project-scoped MCP config for Sentry
  await offerProjectScopedMcpConfig();

  clack.outro(`
${chalk.green(
  'Sentry has been successfully configured for your Remix project.',
)}

${chalk.cyan('You can now deploy your project to see Sentry in action.')}

${chalk.cyan(
  `To learn more about how to use Sentry with Remix, visit our documentation:
https://docs.sentry.io/platforms/javascript/guides/remix/`,
)}`);
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
      initialValue: false,
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
