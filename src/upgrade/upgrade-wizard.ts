// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  detectSentryVersion,
  calculateMigrationPath,
} from './version-detection.js';
import { discoverFiles, readPackageJson } from './file-discovery.js';
import { runCodemodsOnFiles } from './codemod-runner.js';
import { v8ToV9Codemods } from './codemods/v8-to-v9/index.js';
import type { CodemodTransform } from './types.js';

const CODEMOD_REGISTRY: Record<string, CodemodTransform[]> = {
  'v8-to-v9': v8ToV9Codemods,
};

export async function runUpgradeWizard(options: {
  projectDir: string;
  targetVersion?: number;
}): Promise<void> {
  clack.intro(chalk.inverse(' Sentry SDK Upgrade Wizard '));

  const pkg = readPackageJson(options.projectDir);
  if (!pkg) {
    clack.log.error('No package.json found in project directory.');
    clack.outro('Upgrade cancelled.');
    return;
  }

  const versionInfo = detectSentryVersion(
    pkg as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    },
  );

  if (versionInfo.majorVersion === null) {
    clack.log.error('No @sentry/* packages found in package.json.');
    clack.outro('Upgrade cancelled.');
    return;
  }

  clack.log.info(
    `Detected Sentry SDK v${versionInfo.majorVersion} (${versionInfo.packages.length} package(s))`,
  );

  if (versionInfo.hasRemovedPackages.length > 0) {
    clack.log.warn(
      `Found packages that will be removed: ${versionInfo.hasRemovedPackages
        .map((p) => p.name)
        .join(', ')}`,
    );
  }

  const targetVersion = options.targetVersion ?? versionInfo.majorVersion + 1;
  const migrationPath = calculateMigrationPath(
    versionInfo.majorVersion,
    targetVersion,
  );

  if (migrationPath.length === 0) {
    clack.log.info('Already on the target version. No migration needed.');
    clack.outro('Done!');
    return;
  }

  // Check that we have codemods for all steps
  const missingSteps = migrationPath.filter(
    (step) => !(step in CODEMOD_REGISTRY),
  );
  if (missingSteps.length > 0) {
    clack.log.error(
      `No codemods available for: ${missingSteps.join(
        ', ',
      )}. Only v8→v9 is currently supported.`,
    );
    clack.outro('Upgrade cancelled.');
    return;
  }

  clack.log.info(`Migration path: ${migrationPath.join(' → ')}`);

  const spinner = clack.spinner();
  spinner.start('Discovering files with Sentry imports...');

  const files = await discoverFiles(options.projectDir);
  spinner.stop(`Found ${files.length} file(s) with Sentry imports.`);

  if (files.length === 0) {
    clack.log.warn('No files with Sentry imports found.');
    clack.outro('Done!');
    return;
  }

  // Run codemods for each step
  for (const step of migrationPath) {
    const transforms = CODEMOD_REGISTRY[step];
    clack.log.step(`Running ${step} codemods...`);

    const result = await runCodemodsOnFiles(files, transforms);

    clack.log.info(`Modified ${result.filesModified} file(s).`);

    if (result.totalChanges.length > 0) {
      for (const change of result.totalChanges) {
        clack.log.info(`  ${change}`);
      }
    }

    if (result.manualReviewItems.length > 0) {
      clack.log.warn(
        `${result.manualReviewItems.length} item(s) require manual review:`,
      );
      for (const item of result.manualReviewItems) {
        clack.log.warn(`  ${item.file}:${item.line} — ${item.description}`);
      }
    }

    if (result.errors.length > 0) {
      clack.log.error(`${result.errors.length} file(s) had errors:`);
      for (const err of result.errors) {
        clack.log.error(`  ${err.file}: ${err.error}`);
      }
    }
  }

  clack.outro(
    chalk.green('Upgrade codemods applied! Review changes and run your tests.'),
  );
}
