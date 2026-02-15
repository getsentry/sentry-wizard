import * as os from 'os';
import * as path from 'path';

export type EditorId =
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'cursor'
  | 'copilot'
  | 'factory-droid';

export interface EditorConfig {
  id: EditorId;
  label: string;
  projectPath: string;
  userPath: string;
}

/**
 * Configuration for each supported AI coding assistant's skills directory.
 *
 * Project paths are relative to the current working directory.
 * User paths are absolute paths in the user's home directory.
 */
export const EDITOR_CONFIGS: Record<EditorId, EditorConfig> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    projectPath: '.claude/skills',
    userPath: path.join(os.homedir(), '.claude', 'skills'),
  },
  codex: {
    id: 'codex',
    label: 'OpenAI Codex',
    projectPath: '.codex/skills',
    userPath: path.join(os.homedir(), '.codex', 'skills'),
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    projectPath: '.opencode/skill',
    userPath: path.join(os.homedir(), '.config', 'opencode', 'skill'),
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    projectPath: '.cursor/skills',
    userPath: path.join(os.homedir(), '.cursor', 'skills'),
  },
  copilot: {
    id: 'copilot',
    label: 'GitHub Copilot',
    projectPath: '.github/skills',
    userPath: path.join(os.homedir(), '.copilot', 'skills'),
  },
  'factory-droid': {
    id: 'factory-droid',
    label: 'Factory Droid',
    projectPath: '.factory/skills',
    userPath: path.join(os.homedir(), '.factory', 'skills'),
  },
};

/**
 * Get the skills directory path for a given editor and scope.
 */
export function getSkillsPath(
  editorId: EditorId,
  scope: 'project' | 'user',
): string {
  const config = EDITOR_CONFIGS[editorId];
  if (scope === 'project') {
    return path.join(process.cwd(), config.projectPath);
  }
  return config.userPath;
}

/**
 * Get all editor IDs as an array.
 */
export function getAllEditorIds(): EditorId[] {
  return Object.keys(EDITOR_CONFIGS) as EditorId[];
}

/**
 * Get editor options for clack multiselect prompt.
 */
export function getEditorOptions(): { value: EditorId; label: string }[] {
  return Object.values(EDITOR_CONFIGS).map((config) => ({
    value: config.id,
    label: config.label,
  }));
}
