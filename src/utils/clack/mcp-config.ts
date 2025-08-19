import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { abortIfCancelled, showCopyPasteInstructions } from './index';

const SENTRY_MCP_BASE_URL = 'https://mcp.sentry.dev/mcp';

// Type definitions for MCP configurations
interface CursorMcpConfig {
  mcpServers?: Record<string, { url: string }>;
}

interface VsCodeMcpConfig {
  servers?: Record<string, { url: string; type: string }>;
}

interface ClaudeCodeMcpConfig {
  mcpServers?: Record<string, { url: string }>;
}

/**
 * Constructs the MCP URL with optional org and project slugs
 */
function getMcpUrl(orgSlug?: string, projectSlug?: string): string {
  if (orgSlug && projectSlug) {
    return `${SENTRY_MCP_BASE_URL}/${orgSlug}/${projectSlug}`;
  }
  return SENTRY_MCP_BASE_URL;
}

function ensureDir(dirpath: string): void {
  fs.mkdirSync(dirpath, { recursive: true });
}

async function readJsonIfExists(filepath: string): Promise<unknown | null> {
  try {
    const txt = await fs.promises.readFile(filepath, 'utf8');
    return JSON.parse(txt) as unknown;
  } catch {
    return null;
  }
}

async function writeJson(filepath: string, obj: unknown): Promise<void> {
  ensureDir(path.dirname(filepath));
  await fs.promises.writeFile(filepath, JSON.stringify(obj, null, 2), 'utf8');
}

function getCursorMcpJsonSnippet(orgSlug?: string, projectSlug?: string): string {
  const obj = {
    mcpServers: {
      Sentry: {
        url: getMcpUrl(orgSlug, projectSlug),
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

function getVsCodeMcpJsonSnippet(orgSlug?: string, projectSlug?: string): string {
  const obj = {
    servers: {
      Sentry: {
        url: getMcpUrl(orgSlug, projectSlug),
        type: 'http',
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

function getClaudeCodeMcpJsonSnippet(orgSlug?: string, projectSlug?: string): string {
  const obj = {
    mcpServers: {
      Sentry: {
        url: getMcpUrl(orgSlug, projectSlug),
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

function getJetBrainsMcpJsonSnippet(orgSlug?: string, projectSlug?: string): string {
  const obj = {
    mcpServers: {
      Sentry: {
        url: getMcpUrl(orgSlug, projectSlug),
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

function getGenericMcpJsonSnippet(orgSlug?: string, projectSlug?: string): string {
  const obj = {
    mcpServers: {
      Sentry: {
        url: getMcpUrl(orgSlug, projectSlug),
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

async function addCursorMcpConfig(orgSlug?: string, projectSlug?: string): Promise<void> {
  const file = path.join(process.cwd(), '.cursor', 'mcp.json');
  const existing = await readJsonIfExists(file);
  if (!existing) {
    await writeJson(file, JSON.parse(getCursorMcpJsonSnippet(orgSlug, projectSlug)));
    clack.log.success(
      chalk.cyan(path.join('.cursor', 'mcp.json')) + ' created.',
    );
    return;
  }
  try {
    const updated = { ...existing } as CursorMcpConfig;
    updated.mcpServers = updated.mcpServers || {};
    updated.mcpServers['Sentry'] = {
      url: getMcpUrl(orgSlug, projectSlug),
    };
    await writeJson(file, updated);
    clack.log.success('Updated .cursor/mcp.json');
  } catch {
    throw new Error('Failed to update .cursor/mcp.json');
  }
}

async function addVsCodeMcpConfig(orgSlug?: string, projectSlug?: string): Promise<void> {
  const file = path.join(process.cwd(), '.vscode', 'mcp.json');
  const existing = await readJsonIfExists(file);
  if (!existing) {
    await writeJson(file, JSON.parse(getVsCodeMcpJsonSnippet(orgSlug, projectSlug)));
    clack.log.success(
      chalk.cyan(path.join('.vscode', 'mcp.json')) + ' created.',
    );
    return;
  }
  try {
    const updated = { ...existing } as VsCodeMcpConfig;
    updated.servers = updated.servers || {};
    updated.servers['Sentry'] = {
      url: getMcpUrl(orgSlug, projectSlug),
      type: 'http',
    };
    await writeJson(file, updated);
    clack.log.success('Updated .vscode/mcp.json');
  } catch {
    throw new Error('Failed to update .vscode/mcp.json');
  }
}

async function addClaudeCodeMcpConfig(orgSlug?: string, projectSlug?: string): Promise<void> {
  const file = path.join(process.cwd(), '.mcp.json');
  const existing = await readJsonIfExists(file);
  if (!existing) {
    await writeJson(file, JSON.parse(getClaudeCodeMcpJsonSnippet(orgSlug, projectSlug)));
    clack.log.success(chalk.cyan('.mcp.json') + ' created.');
    return;
  }
  try {
    const updated = { ...existing } as ClaudeCodeMcpConfig;
    updated.mcpServers = updated.mcpServers || {};
    updated.mcpServers['Sentry'] = {
      url: getMcpUrl(orgSlug, projectSlug),
    };
    await writeJson(file, updated);
    clack.log.success('Updated .mcp.json');
  } catch {
    throw new Error('Failed to update .mcp.json');
  }
}

/**
 * Copies text to clipboard across different platforms
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = 'pbcopy';
    } else if (platform === 'win32') {
      command = 'clip';
    } else {
      // Linux
      command = 'xclip -selection clipboard';
    }

    const proc = childProcess.spawn(command, [], { shell: true });
    proc.stdin.write(text);
    proc.stdin.end();

    return new Promise((resolve) => {
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Shows MCP configuration for JetBrains IDEs with copy-to-clipboard option
 */
async function showJetBrainsMcpConfig(orgSlug?: string, projectSlug?: string): Promise<void> {
  const configSnippet = getJetBrainsMcpJsonSnippet(orgSlug, projectSlug);

  clack.log.info(
    chalk.cyan('For JetBrains IDEs (WebStorm, IntelliJ IDEA, PyCharm, etc.):'),
  );
  clack.log.info(
    chalk.dim(
      "Add the following configuration to your IDE's MCP settings.\n" +
        'See: https://www.jetbrains.com/help/webstorm/mcp-server.html',
    ),
  );

  // Display the configuration
  // eslint-disable-next-line no-console
  console.log('\n' + chalk.green(configSnippet) + '\n');

  // Ask if user wants to copy to clipboard
  const shouldCopy: boolean = await abortIfCancelled(
    clack.select({
      message: 'Copy configuration to clipboard?',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
      initialValue: true,
    }),
  );

  if (shouldCopy) {
    const copied = await copyToClipboard(configSnippet);

    if (copied) {
      clack.log.success('Configuration copied to clipboard!');
      Sentry.setTag('mcp-clipboard-copy', 'success');
    } else {
      clack.log.warn(
        'Failed to copy to clipboard. Please copy the configuration above manually.',
      );
      Sentry.setTag('mcp-clipboard-copy', 'failed');
    }
  } else {
    Sentry.setTag('mcp-clipboard-copy', 'declined');
  }

  clack.log.info(
    chalk.dim(
      'Note: You may need to restart your IDE for MCP changes to take effect.',
    ),
  );
}

/**
 * Shows generic MCP configuration for unsupported IDEs with copy-to-clipboard option
 */
async function showGenericMcpConfig(orgSlug?: string, projectSlug?: string): Promise<void> {
  const configSnippet = getGenericMcpJsonSnippet(orgSlug, projectSlug);

  clack.log.info(chalk.cyan('Generic MCP configuration for your IDE:'));
  clack.log.info(
    chalk.dim(
      'If your IDE supports MCP servers, you can use the following configuration.\n' +
        "Please consult your IDE's documentation for how to add MCP server configurations.",
    ),
  );

  // Display the configuration
  // eslint-disable-next-line no-console
  console.log('\n' + chalk.green(configSnippet) + '\n');

  // Ask if user wants to copy to clipboard
  const shouldCopy: boolean = await abortIfCancelled(
    clack.select({
      message: 'Copy configuration to clipboard?',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
      initialValue: true,
    }),
  );

  if (shouldCopy) {
    const copied = await copyToClipboard(configSnippet);

    if (copied) {
      clack.log.success('Configuration copied to clipboard!');
      Sentry.setTag('mcp-clipboard-copy', 'success');
    } else {
      clack.log.warn(
        'Failed to copy to clipboard. Please copy the configuration above manually.',
      );
      Sentry.setTag('mcp-clipboard-copy', 'failed');
    }
  } else {
    Sentry.setTag('mcp-clipboard-copy', 'declined');
  }

  clack.log.info(
    chalk.dim(
      'Note: The exact configuration format may vary depending on your IDE.\n' +
        "If your IDE doesn't support MCP yet, please check back later or open an issue at:\n" +
        'https://github.com/getsentry/sentry-wizard/issues',
    ),
  );
}

/**
 * Explains what MCP is and its benefits for Sentry users
 */
async function explainMCP(): Promise<boolean> {
  clack.log.info(chalk.cyan('What is MCP (Model Context Protocol)?'));

  clack.log.info(
    chalk.dim(
      'MCP is a protocol that allows AI assistants in your IDE to interact with external tools and services.\n\n' +
        'The Sentry MCP server enables AI assistants to:\n' +
        '  • Query and analyze your Sentry issues directly from your IDE\n' +
        '  • Get context about errors and performance problems\n' +
        '  • Help debug issues with production data insights\n' +
        '  • Suggest fixes based on real error patterns\n\n' +
        "This makes it easier to fix bugs by bringing Sentry's insights directly into your development workflow.\n\n" +
        'Learn more: ' +
        chalk.cyan('https://docs.sentry.io/product/sentry-mcp/'),
    ),
  );

  // Ask again after explanation
  const shouldAddAfterExplanation: boolean = await abortIfCancelled(
    clack.select({
      message: 'Would you like to configure MCP for your IDE now?',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false, hint: 'You can add it later anytime' },
      ],
      initialValue: true,
    }),
  );

  return shouldAddAfterExplanation;
}

/**
 * Offers to add a project-scoped MCP server configuration for the Sentry MCP.
 * Supports Cursor, VS Code, and Claude Code.
 * @param orgSlug - Optional organization slug to include in the MCP URL
 * @param projectSlug - Optional project slug to include in the MCP URL
 */
export async function offerProjectScopedMcpConfig(orgSlug?: string, projectSlug?: string): Promise<void> {
  type InitialChoice = 'yes' | 'no' | 'explain';

  const initialChoice: InitialChoice = await abortIfCancelled(
    clack.select<
      { value: InitialChoice; label: string; hint?: string }[],
      InitialChoice
    >({
      message:
        'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no', hint: 'You can add it later anytime' },
        {
          label: 'What is MCP?',
          value: 'explain',
          hint: 'Learn about MCP benefits',
        },
      ],
      initialValue: 'yes',
    }),
  );

  let shouldAdd: boolean;

  if (initialChoice === 'explain') {
    Sentry.setTag('mcp-choice', 'explain');
    shouldAdd = await explainMCP();
    Sentry.setTag('mcp-configured-after-explain', shouldAdd);
  } else {
    shouldAdd = initialChoice === 'yes';
    Sentry.setTag('mcp-choice', initialChoice);
  }

  if (!shouldAdd) {
    Sentry.setTag('mcp-configured', false);
    return;
  }

  Sentry.setTag('mcp-configured', true);

  type EditorChoice =
    | 'cursor'
    | 'vscode'
    | 'claudeCode'
    | 'jetbrains'
    | 'other';
  const editor: EditorChoice = await abortIfCancelled(
    clack.select({
      message: 'Which editor do you want to configure?',
      options: [
        { value: 'cursor', label: 'Cursor (project .cursor/mcp.json)' },
        { value: 'vscode', label: 'VS Code (project .vscode/mcp.json)' },
        { value: 'claudeCode', label: 'Claude Code (project .mcp.json)' },
        {
          value: 'jetbrains',
          label: 'JetBrains IDE (WebStorm, IntelliJ IDEA, PyCharm, etc.)',
          hint: 'Manual configuration required',
        },
        {
          value: 'other',
          label: 'I use a different IDE',
          hint: "We'll show you the configuration to copy",
        },
      ],
    }),
  );

  // Track which editor was selected
  Sentry.setTag('mcp-editor', editor);

  try {
    switch (editor) {
      case 'cursor':
        await addCursorMcpConfig(orgSlug, projectSlug);
        clack.log.success('Added project-scoped Sentry MCP configuration.');
        clack.log.info(
          chalk.dim(
            'Note: You may need to reload your editor for MCP changes to take effect.',
          ),
        );
        Sentry.setTag('mcp-config-success', true);
        break;
      case 'vscode':
        await addVsCodeMcpConfig(orgSlug, projectSlug);
        clack.log.success('Added project-scoped Sentry MCP configuration.');
        clack.log.info(
          chalk.dim(
            'Note: You may need to reload your editor for MCP changes to take effect.',
          ),
        );
        Sentry.setTag('mcp-config-success', true);
        break;
      case 'claudeCode':
        await addClaudeCodeMcpConfig(orgSlug, projectSlug);
        clack.log.success('Added project-scoped Sentry MCP configuration.');
        clack.log.info(
          chalk.dim(
            'Note: You may need to reload your editor for MCP changes to take effect.',
          ),
        );
        Sentry.setTag('mcp-config-success', true);
        break;
      case 'jetbrains':
        await showJetBrainsMcpConfig(orgSlug, projectSlug);
        Sentry.setTag('mcp-config-success', true);
        Sentry.setTag('mcp-config-manual', true);
        break;
      case 'other':
        await showGenericMcpConfig(orgSlug, projectSlug);
        Sentry.setTag('mcp-config-success', true);
        Sentry.setTag('mcp-config-manual', true);
        break;
    }
  } catch (e) {
    Sentry.setTag('mcp-config-success', false);
    Sentry.setTag('mcp-config-fallback', true);
    clack.log.warn(
      chalk.yellow(
        'Failed to write MCP config automatically. Please copy/paste the snippet below into your project config file.',
      ),
    );
    // Fallback: show per-editor instructions
    if (editor === 'cursor') {
      await showCopyPasteInstructions({
        filename: path.join('.cursor', 'mcp.json'),
        codeSnippet: getCursorMcpJsonSnippet(orgSlug, projectSlug),
        hint: 'create the file if it does not exist',
      });
    } else if (editor === 'vscode') {
      await showCopyPasteInstructions({
        filename: path.join('.vscode', 'mcp.json'),
        codeSnippet: getVsCodeMcpJsonSnippet(orgSlug, projectSlug),
        hint: 'create the file if it does not exist',
      });
    } else if (editor === 'claudeCode') {
      await showCopyPasteInstructions({
        filename: '.mcp.json',
        codeSnippet: getClaudeCodeMcpJsonSnippet(orgSlug, projectSlug),
        hint: 'create the file if it does not exist',
      });
    }
  }
}