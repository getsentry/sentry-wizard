import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('Agent Skills', () => {
  describe('headless mode with --skills flag', () => {
    let wizardExitCode: number;
    let projectDir: string;
    let cleanup: () => void;

    beforeAll(async () => {
      // Create a temporary directory for project scope installation
      const tmpBaseDir = path.join(os.tmpdir(), 'sentry-wizard-e2e');
      if (!fs.existsSync(tmpBaseDir)) {
        fs.mkdirSync(tmpBaseDir, { recursive: true });
      }
      projectDir = fs.mkdtempSync(path.join(tmpBaseDir, 'agent-skills-'));

      cleanup = () => {
        try {
          const keepOnFailure =
            process.env.SENTRY_WIZARD_E2E_KEEP_TEMP === 'true';
          if (!keepOnFailure) {
            fs.rmSync(projectDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup errors
        }
      };

      const binName = process.env.SENTRY_WIZARD_E2E_TEST_BIN
        ? ['dist-bin', `sentry-wizard-${process.platform}-${process.arch}`]
        : ['dist', 'bin.js'];
      const binPath = path.join(__dirname, '..', '..', ...binName);

      // Run wizard with --skills claude-code in headless mode (specific editors)
      wizardExitCode = await withEnv({
        cwd: projectDir,
        debug: true,
      })
        .defineInteraction()
        .expectOutput('Successfully installed Sentry agent skills!')
        .run(`${binPath} --skills claude-code --disable-telemetry`);
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('creates .claude/skills directory', () => {
      const skillsDir = path.join(projectDir, '.claude', 'skills');
      expect(fs.existsSync(skillsDir)).toBe(true);
    });

    test('installs sentry skills', () => {
      const skillsDir = path.join(projectDir, '.claude', 'skills');

      // Check that at least one Sentry skill was installed
      const entries = fs.readdirSync(skillsDir);
      const sentrySkills = entries.filter((e) => e.startsWith('sentry-'));

      expect(sentrySkills.length).toBeGreaterThan(0);
    });

    test('skill has SKILL.md file', () => {
      const skillsDir = path.join(projectDir, '.claude', 'skills');
      const entries = fs.readdirSync(skillsDir);
      const sentrySkill = entries.find((e) => e.startsWith('sentry-'));

      if (sentrySkill) {
        const skillMdPath = path.join(skillsDir, sentrySkill, 'SKILL.md');
        expect(fs.existsSync(skillMdPath)).toBe(true);
      }
    });
  });

  describe('interactive mode', () => {
    let wizardExitCode: number;
    let projectDir: string;
    let cleanup: () => void;

    beforeAll(async () => {
      // Create a temporary directory for project scope installation
      const tmpBaseDir = path.join(os.tmpdir(), 'sentry-wizard-e2e');
      if (!fs.existsSync(tmpBaseDir)) {
        fs.mkdirSync(tmpBaseDir, { recursive: true });
      }
      projectDir = fs.mkdtempSync(
        path.join(tmpBaseDir, 'agent-skills-interactive-'),
      );

      cleanup = () => {
        try {
          const keepOnFailure =
            process.env.SENTRY_WIZARD_E2E_KEEP_TEMP === 'true';
          if (!keepOnFailure) {
            fs.rmSync(projectDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup errors
        }
      };

      const binName = process.env.SENTRY_WIZARD_E2E_TEST_BIN
        ? ['dist-bin', `sentry-wizard-${process.platform}-${process.arch}`]
        : ['dist', 'bin.js'];
      const binPath = path.join(__dirname, '..', '..', ...binName);

      // Run wizard in interactive mode (no specific editors)
      wizardExitCode = await withEnv({
        cwd: projectDir,
        debug: true,
      })
        .defineInteraction()
        .expectOutput('Sentry Agent Skills Installer')
        .whenAsked('Where do you want to install Sentry agent skills?')
        .respondWith(KEYS.ENTER) // Select project (default)
        .whenAsked('Which AI coding assistants do you want to configure?')
        .respondWith(KEYS.SPACE, KEYS.ENTER) // Select first option
        .expectOutput('Successfully installed Sentry agent skills!')
        .run(`${binPath} --skills --disable-telemetry`);
    });

    afterAll(() => {
      cleanup();
    });

    test('exits with exit code 0', () => {
      expect(wizardExitCode).toBe(0);
    });

    test('creates skills directory for selected editor', () => {
      // The first editor option should create a skills directory
      // Check for any common skills directory patterns
      const possibleDirs = [
        path.join(projectDir, '.claude', 'skills'),
        path.join(projectDir, '.cursor', 'skills'),
        path.join(projectDir, '.codex', 'skills'),
        path.join(projectDir, '.opencode', 'skills'),
        path.join(projectDir, '.copilot', 'skills'),
        path.join(projectDir, '.factory', 'skills'),
      ];

      const existingDir = possibleDirs.find((dir) => fs.existsSync(dir));
      expect(existingDir).toBeDefined();
    });
  });
});
