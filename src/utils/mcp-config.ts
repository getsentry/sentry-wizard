import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
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

async function addCursorMcpConfig(): Promise<void> {
  const file = path.join(process.cwd(), '.cursor', 'mcp.json');
  const existing = await readJsonIfExists(file);
  if (!existing) {
    await writeJson(file, JSON.parse(getCursorMcpJsonSnippet()));
    clack.log.success(chalk.cyan(path.join('.cursor', 'mcp.json')) + ' created.');
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
    clack.log.success(chalk.cyan(path.join('.vscode', 'mcp.json')) + ' created.');
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