import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

import { traceStep, withTelemetry } from '../telemetry';
import { abortIfCancelled } from '../utils/clack';
import { debug } from '../utils/debug';
import { WIZARD_VERSION } from '../version';
import {
  type EditorId,
  EDITOR_CONFIGS,
  getSkillsPath,
  getEditorOptions,
} from './editor-configs';

const SKILLS_TARBALL_URL =
  'https://github.com/getsentry/sentry-agent-skills/releases/download/latest/sentry-agent-skills.tar.gz';

const SKILLS_REPO_ARCHIVE_URL =
  'https://github.com/getsentry/sentry-agent-skills/archive/refs/heads/main.tar.gz';

export interface AgentSkillsWizardOptions {
  telemetryEnabled: boolean;
  editors?: EditorId[];
  scope?: 'project' | 'user';
}

interface CopyResult {
  installed: string[];
  updated: string[];
  skipped: string[];
}

/**
 * Runs the agent skills wizard to install Sentry skills for AI coding assistants.
 */
export async function runAgentSkillsWizard(
  options: AgentSkillsWizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'agentSkills',
      wizardOptions: {
        telemetryEnabled: options.telemetryEnabled,
      },
    },
    () => runAgentSkillsWizardWithTelemetry(options),
  );
}

async function runAgentSkillsWizardWithTelemetry(
  options: AgentSkillsWizardOptions,
): Promise<void> {
  const isHeadless =
    options.editors !== undefined && options.editors.length > 0;

  if (!isHeadless) {
    printWelcome(options.telemetryEnabled);
  }

  // Determine scope
  const scope: 'project' | 'user' = await traceStep(
    'select-scope',
    async () => {
      if (options.scope) {
        return options.scope;
      }

      if (isHeadless) {
        return 'project';
      }

      const selected = await abortIfCancelled(
        clack.select({
          message: 'Where do you want to install Sentry agent skills?',
          options: [
            {
              value: 'project',
              label: 'Project (Recommended)',
              hint: 'Skills are scoped to this project and can be committed to git',
            },
            {
              value: 'user',
              label: 'User profile',
              hint: 'Skills apply to all your projects',
            },
          ],
          initialValue: 'project',
        }),
      );
      return selected as 'project' | 'user';
    },
  );

  Sentry.setTag('skills-scope', scope);

  // Determine editors
  const editors = await traceStep('select-editors', async () => {
    if (options.editors && options.editors.length > 0) {
      return options.editors;
    }

    const selected = await abortIfCancelled(
      clack.multiselect({
        message: 'Which AI coding assistants do you want to configure?',
        options: getEditorOptions(),
        required: true,
      }),
    );

    return selected as EditorId[];
  });

  Sentry.setTag('skills-editors-count', editors.length);
  editors.forEach((editor) => {
    Sentry.setTag(`skills-editor-${editor}`, true);
  });

  // Download and install skills
  const spinner = clack.spinner();
  spinner.start('Downloading Sentry agent skills from GitHub...');

  let tempDir: string;
  try {
    tempDir = await traceStep('download-skills', downloadSkills);
    spinner.stop('Downloaded Sentry agent skills');
  } catch (error) {
    spinner.stop('Failed to download skills');
    clack.log.error(
      `Failed to download Sentry agent skills from GitHub.
Please check your internet connection and try again.

You can also install skills manually from:
${chalk.cyan('https://github.com/getsentry/sentry-agent-skills')}`,
    );
    Sentry.captureException(error);
    throw error;
  }

  // Install skills for each selected editor
  const allResults: Record<EditorId, CopyResult> = {} as Record<
    EditorId,
    CopyResult
  >;

  for (const editorId of editors) {
    const editorConfig = EDITOR_CONFIGS[editorId];
    const targetPath = getSkillsPath(editorId, scope);

    spinner.start(`Installing skills for ${editorConfig.label}...`);

    try {
      const result = await traceStep(`install-skills-${editorId}`, () =>
        copySkillsToEditor(tempDir, targetPath),
      );
      allResults[editorId] = result;
      spinner.stop(`Installed skills for ${editorConfig.label}`);
      Sentry.setTag(`skills-${editorId}-success`, true);
    } catch (error) {
      spinner.stop(`Failed to install skills for ${editorConfig.label}`);
      clack.log.warn(
        `Could not install skills to ${targetPath}. Please check directory permissions.`,
      );
      Sentry.setTag(`skills-${editorId}-success`, false);
      Sentry.captureException(error);
      allResults[editorId] = { installed: [], updated: [], skipped: [] };
    }
  }

  // Clean up temp directory
  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  // Print summary
  printSummary(editors, allResults, scope);
}

function printWelcome(telemetryEnabled: boolean): void {
  // eslint-disable-next-line no-console
  console.log('');
  clack.intro(chalk.inverse(' Sentry Agent Skills Installer '));

  let welcomeText = `This wizard will install Sentry agent skills for your AI coding assistants.

Agent skills help AI assistants understand how to:
  ${chalk.cyan('*')} Set up Sentry tracing and performance monitoring
  ${chalk.cyan('*')} Configure Sentry logging and metrics
  ${chalk.cyan('*')} Set up AI agent monitoring
  ${chalk.cyan('*')} Review Sentry comments on GitHub PRs
  ${chalk.cyan('*')} Run the Sentry Next.js setup wizard

Skills are fetched from: ${chalk.cyan(
    'github.com/getsentry/sentry-agent-skills',
  )}`;

  welcomeText = `${welcomeText}\n\nVersion: ${WIZARD_VERSION}`;

  if (telemetryEnabled) {
    welcomeText = `${welcomeText}

This wizard sends telemetry data and crash reports to Sentry.
You can turn this off by running ${chalk.cyanBright(
      'npx @sentry/wizard --disable-telemetry --skills',
    )}.`;
  }

  clack.note(welcomeText);
}

/**
 * Downloads skills from GitHub and extracts to a temp directory.
 * First tries the release tarball, falls back to archive download.
 */
async function downloadSkills(): Promise<string> {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'sentry-skills-'),
  );

  // Try release tarball first, fall back to archive
  let tarballUrl = SKILLS_TARBALL_URL;
  let extractPath = tempDir;
  let isArchive = false;

  try {
    const response = await fetch(tarballUrl, { method: 'HEAD' });
    if (!response.ok) {
      // Release doesn't exist yet, use archive
      debug('Release tarball not found, falling back to repository archive');
      tarballUrl = SKILLS_REPO_ARCHIVE_URL;
      isArchive = true;
    }
  } catch (error) {
    // Network error on HEAD, try archive
    debug(
      'Network error checking release tarball, falling back to archive:',
      error,
    );
    tarballUrl = SKILLS_REPO_ARCHIVE_URL;
    isArchive = true;
  }

  // Download the tarball
  const response = await fetch(tarballUrl);
  if (!response.ok) {
    throw new Error(`Failed to download skills: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const tarballPath = path.join(tempDir, 'skills.tar.gz');
  await fs.promises.writeFile(tarballPath, Buffer.from(arrayBuffer));

  // Extract using tar command (available on all platforms we support)
  const { execSync } = await import('child_process');
  execSync(`tar -xzf "${tarballPath}" -C "${tempDir}"`, {
    stdio: 'pipe',
  });

  // Remove the tarball
  await fs.promises.unlink(tarballPath);

  // If using archive, skills are in sentry-agent-skills-main/skills/
  // If using release, skills are directly in tempDir
  if (isArchive) {
    extractPath = path.join(tempDir, 'sentry-agent-skills-main', 'skills');
  }

  // Verify skills directory exists
  const skillsExist = await fs.promises
    .access(extractPath)
    .then(() => true)
    .catch(() => false);

  if (!skillsExist) {
    // Maybe release tarball has skills at root
    const entries = await fs.promises.readdir(tempDir);
    const skillDir = entries.find(
      (e) => e.startsWith('sentry-') || e === 'skills',
    );
    if (skillDir === 'skills') {
      extractPath = path.join(tempDir, 'skills');
    } else if (skillDir) {
      // Skills are directly at tempDir root
      extractPath = tempDir;
    } else {
      throw new Error('Could not find skills in downloaded archive');
    }
  }

  return extractPath;
}

/**
 * Copies skills from source directory to target editor skills directory.
 * Implements smart update logic to preserve user-created skills.
 */
async function copySkillsToEditor(
  sourceDir: string,
  targetDir: string,
): Promise<CopyResult> {
  const result: CopyResult = {
    installed: [],
    updated: [],
    skipped: [],
  };

  // Ensure target directory exists
  await fs.promises.mkdir(targetDir, { recursive: true });

  // Get list of skills from source
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillName = entry.name;
    const sourcePath = path.join(sourceDir, skillName);
    const targetPath = path.join(targetDir, skillName);

    const targetExists = await fs.promises
      .access(targetPath)
      .then(() => true)
      .catch(() => false);

    if (!targetExists) {
      // New skill - install it
      await copyDirectory(sourcePath, targetPath);
      result.installed.push(skillName);
    } else {
      // Skill exists - check if it's a Sentry skill
      const isSentry = await isSentrySkill(targetPath);
      if (isSentry) {
        // Update existing Sentry skill
        await fs.promises.rm(targetPath, { recursive: true });
        await copyDirectory(sourcePath, targetPath);
        result.updated.push(skillName);
      } else {
        // User-created skill - skip
        result.skipped.push(skillName);
      }
    }
  }

  return result;
}

/**
 * Checks if a skill directory contains a Sentry skill by examining the SKILL.md frontmatter.
 */
async function isSentrySkill(skillDir: string): Promise<boolean> {
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  try {
    const content = await fs.promises.readFile(skillMdPath, 'utf8');
    // Check if frontmatter name starts with "sentry-"
    const match = content.match(
      /^---[\s\S]*?name:\s*["']?(sentry-[^"'\s\n]+)/m,
    );
    return match !== null;
  } catch {
    return false;
  }
}

/**
 * Recursively copies a directory.
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Prints a summary of the installation results.
 */
function printSummary(
  editors: EditorId[],
  results: Record<EditorId, CopyResult>,
  scope: 'project' | 'user',
): void {
  // eslint-disable-next-line no-console
  console.log('');

  const totalInstalled = Object.values(results).reduce(
    (sum, r) => sum + r.installed.length,
    0,
  );
  const totalUpdated = Object.values(results).reduce(
    (sum, r) => sum + r.updated.length,
    0,
  );

  if (totalInstalled === 0 && totalUpdated === 0) {
    clack.log.warn('No skills were installed. Please check the errors above.');
    return;
  }

  // Build summary message
  let summary = chalk.green('Successfully installed Sentry agent skills!\n\n');

  for (const editorId of editors) {
    const config = EDITOR_CONFIGS[editorId];
    const result = results[editorId];
    const targetPath = getSkillsPath(editorId, scope);

    if (result.installed.length > 0 || result.updated.length > 0) {
      summary += chalk.bold(`${config.label}:\n`);
      summary += `  ${chalk.dim('Path:')} ${targetPath}\n`;

      if (result.installed.length > 0) {
        summary += `  ${chalk.green('Installed:')} ${result.installed.join(
          ', ',
        )}\n`;
      }
      if (result.updated.length > 0) {
        summary += `  ${chalk.blue('Updated:')} ${result.updated.join(', ')}\n`;
      }
      if (result.skipped.length > 0) {
        summary += `  ${chalk.yellow('Skipped:')} ${result.skipped.join(
          ', ',
        )}\n`;
      }
      summary += '\n';
    }
  }

  summary += chalk.dim(
    'Your AI assistant will automatically discover these skills.\n',
  );
  summary += chalk.dim('Try asking: "Set up Sentry tracing in my project"\n');

  clack.note(summary);

  if (scope === 'user') {
    clack.log.info(
      chalk.dim(
        'Skills were installed to your user profile and will apply to all projects.',
      ),
    );
  } else {
    clack.log.info(
      chalk.dim(
        'Skills were installed to your project. Consider committing them to git.',
      ),
    );
  }

  clack.outro(chalk.green('Done!'));
}
