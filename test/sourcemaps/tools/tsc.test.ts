import * as fs from 'fs';
import { enableSourcemaps } from '../../../src/sourcemaps/tools/tsc';

function updateFileContent(content: string): void {
  fileContent = content;
}

let fileContent = '';

jest.mock('@clack/prompts', () => {
  return {
    log: {
      info: jest.fn(),
      success: jest.fn(),
    },
  };
});

jest
  .spyOn(fs.promises, 'readFile')
  .mockImplementation(() => Promise.resolve(fileContent));

const writeFileSpy = jest
  .spyOn(fs.promises, 'writeFile')
  .mockImplementation(() => Promise.resolve(void 0));

describe('enableSourcemaps', () => {
  afterEach(() => {
    fileContent = '';
    jest.clearAllMocks();
  });

  it.each([
    [
      'no sourcemaps options',
      `
/**
 * My TS config with comments
 */
{
  "extends": "./tsconfig.build.json",

  "compilerOptions": {
    // line comment which should stay
    "moduleResolution": "node16",
    "outDir": "dist" // another inline comment
  },

  "include": [
    "src/**/*",
    "test/**/*"
  ]
}
`,
      `
/**
 * My TS config with comments
 */
{
  "extends": "./tsconfig.build.json",

  "compilerOptions": {
    // line comment which should stay
    "moduleResolution": "node16",

    // another inline comment
    "outDir": "dist",

    "sourceMap": true,
    "inlineSources": true,

    // Set \`sourceRoot\` to  "/" to strip the build path prefix
    // from generated source code references.
    // This improves issue grouping in Sentry.
    "sourceRoot": "/"
  },

  "include": [
    "src/**/*",
    "test/**/*"
  ]
}
`,
    ],
    [
      'a few sourcemaps options',
      `
/**
 * My TS config with comments
 */
{
  "extends": "./tsconfig.build.json",

  "compilerOptions": {
    // line comment which should stay
    "moduleResolution": "node16",
    "outDir": "dist", // another inline comment
    "sourceMap": false,
    "sourceRoot": "/src"
  },

  "include": [
    "src/**/*",
    "test/**/*"
  ]
}
`,
      `
/**
 * My TS config with comments
 */
{
  "extends": "./tsconfig.build.json",

  "compilerOptions": {
    // line comment which should stay
    "moduleResolution": "node16",

    // another inline comment
    "outDir": "dist",

    "sourceMap": true,

    // Set \`sourceRoot\` to  "/" to strip the build path prefix
    // from generated source code references.
    // This improves issue grouping in Sentry.
    "sourceRoot": "/",

    "inlineSources": true
  },

  "include": [
    "src/**/*",
    "test/**/*"
  ]
}
`,
    ],
    [
      'no compiler options',
      `
{
    "include": [
        "src/**/*",
        "test/**/*"
    ]
}
`,
      `
{
    "include": [
        "src/**/*",
        "test/**/*"
    ],

    "compilerOptions": {
        "sourceMap": true,
        "inlineSources": true,

        // Set \`sourceRoot\` to  "/" to strip the build path prefix
        // from generated source code references.
        // This improves issue grouping in Sentry.
        "sourceRoot": "/"
    }
}
`,
    ],
  ])(
    'adds the plugin and enables source maps generation (%s)',
    async (_, originalCode, expectedCode) => {
      updateFileContent(originalCode);

      const addedCode = await enableSourcemaps('');

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      const [[, fileContent]] = writeFileSpy.mock.calls;
      expect(fileContent).toBe(expectedCode);
      expect(addedCode).toBe(true);
    },
  );
});
