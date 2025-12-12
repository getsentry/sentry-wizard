import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

//@ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { addVitePlugin } from 'magicast/helpers';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

import { hasSentryContent } from '../../utils/ast-utils';
import { debug } from '../../utils/debug';
import { abortIfCancelled } from '../../utils/clack';
import type { ProjectInfo } from './types';
import { modifyAndRecordFail } from './utils';

export async function modifyViteConfig(
  viteConfigPath: string,
  projectInfo: ProjectInfo,
): Promise<void> {
  const viteConfigContent = (
    await fs.promises.readFile(viteConfigPath, 'utf-8')
  ).toString();

  const { org, project, url, selfHosted } = projectInfo;

  const prettyViteConfigFilename = chalk.cyan(path.basename(viteConfigPath));

  try {
    const viteModule = parseModule(viteConfigContent);

    if (hasSentryContent(viteModule.$ast as t.Program)) {
      clack.log.warn(
        `File ${prettyViteConfigFilename} already contains Sentry code.
Skipping adding Sentry functionality to.`,
      );
      Sentry.setTag(`modified-vite-cfg`, 'fail');
      Sentry.setTag(`vite-cfg-fail-reason`, 'has-sentry-content');
      return;
    }

    await modifyAndRecordFail(
      () =>
        addVitePlugin(viteModule, {
          imported: 'sentrySvelteKit',
          from: '@sentry/sveltekit',
          constructor: 'sentrySvelteKit',
          options: {
            org,
            project,
            ...(selfHosted && { url }),
          },
          index: 0,
        }),
      'add-vite-plugin',
      'vite-cfg',
    );

    await modifyAndRecordFail(
      async () => {
        const code = generateCode(viteModule.$ast).code;
        await fs.promises.writeFile(viteConfigPath, code);
      },
      'write-file',
      'vite-cfg',
    );
  } catch (e) {
    debug(e);
    await showFallbackViteCopyPasteSnippet(
      viteConfigPath,
      getViteConfigCodeSnippet(org, project, selfHosted, url),
    );
    Sentry.captureException('Sveltekit Vite Config Modification Fail');
  }

  clack.log.success(`Added Sentry code to ${prettyViteConfigFilename}`);
  Sentry.setTag(`modified-vite-cfg`, 'success');
}

async function showFallbackViteCopyPasteSnippet(
  viteConfigPath: string,
  codeSnippet: string,
) {
  const viteConfigFilename = path.basename(viteConfigPath);

  clack.log.warning(
    `Couldn't automatically modify your ${chalk.cyan(viteConfigFilename)}
${chalk.dim(`This sometimes happens when we encounter more complex vite configs.
It may not seem like it but sometimes our magical powers are limited ;)`)}`,
  );

  clack.log.info("But don't worry - it's super easy to do this yourself!");

  clack.log.step(
    `Add the following code to your ${chalk.cyan(viteConfigFilename)}:`,
  );

  // Intentionally logging to console here for easier copy/pasting
  // eslint-disable-next-line no-console
  console.log(codeSnippet);

  await abortIfCancelled(
    clack.select({
      message: 'Did you copy the snippet above?',
      options: [
        { label: 'Yes!', value: true, hint: "Great, that's already it!" },
      ],
      initialValue: true,
    }),
  );
}

const getViteConfigCodeSnippet = (
  org: string,
  project: string,
  selfHosted: boolean,
  url: string,
) =>
  chalk.gray(`
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
${chalk.greenBright("import { sentrySvelteKit } from '@sentry/sveltekit'")}

export default defineConfig({
  plugins: [
    // Make sure \`sentrySvelteKit\` is registered before \`sveltekit\`
    ${chalk.greenBright(`sentrySvelteKit({
      org: '${org}',
      project: '${project}',${selfHosted ? `\n        url: '${url}',` : ''}
    }),`)}
    sveltekit(),
  ]
});
`);
