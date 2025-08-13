import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import chalk from 'chalk';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { abortIfCancelled, showCopyPasteInstructions } from '../utils/clack';

const SENTRY_MCP_URL = 'https://mcp.sentry.dev/mcp';

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

function getJetBrainsMcpJsonSnippet(): string {
  const obj = {
    mcpServers: {
      Sentry: {
        url: SENTRY_MCP_URL,
      },
    },
  } as const;
  return JSON.stringify(obj, null, 2);
}

function getGenericMcpJsonSnippet(): string {
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
    clack.log.success(
      chalk.cyan(path.join('.cursor', 'mcp.json')) + ' created.',
    );
    return;
  }
  try {
    const updated = { ...existing } as CursorMcpConfig;
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
    clack.log.success(
      chalk.cyan(path.join('.vscode', 'mcp.json')) + ' created.',
    );
    return;
  }
  try {
    const updated = { ...existing } as VsCodeMcpConfig;
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
    const updated = { ...existing } as ClaudeCodeMcpConfig;
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
async function showJetBrainsMcpConfig(): Promise<void> {
  const configSnippet = getJetBrainsMcpJsonSnippet();

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

  // Try to copy to clipboard
  const copied = await copyToClipboard(configSnippet);

  if (copied) {
    clack.log.success('Configuration copied to clipboard!');
  } else {
    // Offer to press enter to copy manually if automatic copy failed
    await abortIfCancelled(
      clack.select({
        message: 'Copy the configuration above manually',
        options: [{ label: 'Continue', value: true }],
        initialValue: true,
      }),
    );
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
async function showGenericMcpConfig(): Promise<void> {
  const configSnippet = getGenericMcpJsonSnippet();

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

  // Try to copy to clipboard
  const copied = await copyToClipboard(configSnippet);

  if (copied) {
    clack.log.success('Configuration copied to clipboard!');
  } else {
    // Offer to press enter to copy manually if automatic copy failed
    await abortIfCancelled(
      clack.select({
        message: 'Copy the configuration above manually',
        options: [{ label: 'Continue', value: true }],
        initialValue: true,
      }),
    );
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
 * Offers to add a project-scoped MCP server configuration for the Sentry MCP.
 * Supports Cursor, VS Code, and Claude Code.
 */
export async function offerProjectScopedMcpConfig(): Promise<void> {
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

  try {
    switch (editor) {
      case 'cursor':
        await addCursorMcpConfig();
        clack.log.success('Added project-scoped Sentry MCP configuration.');
        clack.log.info(
          chalk.dim(
            'Note: You may need to reload your editor for MCP changes to take effect.',
          ),
        );
        break;
      case 'vscode':
        await addVsCodeMcpConfig();
        clack.log.success('Added project-scoped Sentry MCP configuration.');
        clack.log.info(
          chalk.dim(
            'Note: You may need to reload your editor for MCP changes to take effect.',
          ),
        );
        break;
      case 'claudeCode':
        await addClaudeCodeMcpConfig();
        clack.log.success('Added project-scoped Sentry MCP configuration.');
        clack.log.info(
          chalk.dim(
            'Note: You may need to reload your editor for MCP changes to take effect.',
          ),
        );
        break;
      case 'jetbrains':
        await showJetBrainsMcpConfig();
        break;
      case 'other':
        await showGenericMcpConfig();
        break;
    }
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
    } else if (editor === 'claudeCode') {
      await showCopyPasteInstructions({
        filename: '.mcp.json',
        codeSnippet: getClaudeCodeMcpJsonSnippet(),
        hint: 'create the file if it does not exist',
      });
    }
  }
}
