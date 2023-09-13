import * as fs from 'fs';
import * as path from 'path';

import * as recast from 'recast';

import * as Sentry from '@sentry/node';

// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';

import {
  askForToolConfigPath,
  createNewConfigFile,
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../../utils/clack-utils';
import {
  findFile,
  getOrSetObjectProperty,
  parseJsonC,
  printJsonC,
  setOrUpdateObjectProperty,
} from '../../utils/ast-utils';
import { debug } from '../../utils/debug';

const b = recast.types.builders;

const getCodeSnippet = (colors: boolean) =>
  makeCodeSnippet(colors, (unchanged, plus, _) =>
    unchanged(
      `{
  "compilerOptions": {
    ${plus('"sourceMap": true,')}
    ${plus('"inlineSources": true,')}

    // Set \`sourceRoot\` to  "/" to strip the build path prefix from
    // generated source code references. This will improve issue grouping in Sentry.
    ${plus('"sourceRoot": "/"')}
  }
}`,
    ),
  );

export async function configureTscSourcemapGenerationFlow(): Promise<void> {
  const tsConfigPath =
    findFile(path.join(process.cwd(), 'tsconfig'), ['.json']) ??
    (await askForToolConfigPath('TypeScript', 'tsconfig.json'));

  let successfullyAdded = false;
  if (tsConfigPath) {
    successfullyAdded = await enableSourcemaps(tsConfigPath);
  } else {
    successfullyAdded = await createNewConfigFile(
      path.join(process.cwd(), 'tsconfig.json'),
      getCodeSnippet(false),
    );
    Sentry.setTag('created-new-config', successfullyAdded ? 'success' : 'fail');
  }

  if (successfullyAdded) {
    Sentry.setTag('ast-mod', 'success');
    clack.log.info(
      `We recommend checking the ${
        tsConfigPath ? 'modified' : 'added'
      } file after the wizard finished to ensure it works with your build setup.`,
    );
  } else {
    Sentry.setTag('ast-mod', 'fail');
    await showCopyPasteInstructions(
      'tsconfig.json',
      getCodeSnippet(true),
      'This ensures that source maps are generated correctly',
    );
  }
}

/**
 * Modifies tsconfig.json (@param tsConfigPath) to enable source maps generation.
 *
 * Exported only for testing
 */
export async function enableSourcemaps(tsConfigPath: string): Promise<boolean> {
  try {
    const tsConfig = await fs.promises.readFile(tsConfigPath, 'utf-8');

    const { ast, jsonObject } = parseJsonC(tsConfig.toString());

    if (!jsonObject || !ast) {
      // this will only happen if the input file isn't valid JSON-C
      Sentry.setTag('ast-mod-fail-reason', 'original-file-invalid');
      return false;
    }

    const compilerOptionsProp = getOrSetObjectProperty(
      jsonObject,
      'compilerOptions',
      b.objectExpression([]),
    );

    const compilerOptionsObj = compilerOptionsProp.value;

    if (!compilerOptionsObj || compilerOptionsObj.type !== 'ObjectExpression') {
      // a valid compilerOptions prop should always be an object expression
      Sentry.setTag('ast-mod-fail-reason', 'original-file-invalid');
      return false;
    }

    setOrUpdateObjectProperty(
      compilerOptionsObj,
      'sourceMap',
      b.booleanLiteral(true),
    );

    setOrUpdateObjectProperty(
      compilerOptionsObj,
      'inlineSources',
      b.booleanLiteral(true),
    );

    setOrUpdateObjectProperty(
      compilerOptionsObj,
      'sourceRoot',
      b.stringLiteral('/'),
      'Set `sourceRoot` to  "/" to strip the build path prefix\nfrom generated source code references.\nThis improves issue grouping in Sentry.',
    );

    const code = printJsonC(ast);

    await fs.promises.writeFile(tsConfigPath, code);

    clack.log.success(
      `Enabled source maps generation in ${chalk.cyan(
        path.basename(tsConfigPath || 'tsconfig.json'),
      )}.`,
    );

    return true;
  } catch (e) {
    debug(e);
    Sentry.setTag('ast-mod-fail-reason', 'insertion-fail');
    return false;
  }
}
