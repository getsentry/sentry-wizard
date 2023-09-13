import {
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../../utils/clack-utils';

export async function configureTscSourcemapGenerationFlow(): Promise<void> {
  await showCopyPasteInstructions(
    'tsconfig.json',
    getCodeSnippet(true),
    'This ensures that source maps are generated correctly',
  );
}

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
