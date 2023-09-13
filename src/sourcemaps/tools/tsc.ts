import * as fs from 'fs';

import * as recast from 'recast';

import {
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../../utils/clack-utils';
import {
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
  await showCopyPasteInstructions(
    'tsconfig.json',
    getCodeSnippet(true),
    'This ensures that source maps are generated correctly',
  );
}

export async function enableSourcemaps(tsConfigPath: string): Promise<boolean> {
  try {
    const tsConfig = await fs.promises.readFile(tsConfigPath, 'utf-8');

    const { ast, jsonObject } = parseJsonC(tsConfig.toString());

    if (!jsonObject || !ast) {
      // this will only happen if the input file isn't valid JSON-C
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
    return true;
  } catch (e) {
    debug(e);
    return false;
  }
}
