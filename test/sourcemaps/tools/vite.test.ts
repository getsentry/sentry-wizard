import * as fs from 'fs';
import { addVitePluginToConfig } from '../../../src/sourcemaps/tools/vite';

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

describe('addVitePluginToConfig', () => {
  afterEach(() => {
    fileContent = '';
    jest.clearAllMocks();
  });

  it.each([
    [
      'no build options',
      `
export default defineConfig({
  plugins: [
    vue(),
  ],
})
`,
      `import { sentryVitePlugin } from "@sentry/vite-plugin";
export default defineConfig({
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],

  build: {
    sourcemap: true
  }
})`,
    ],
    [
      'no build.sourcemap options',
      `
export default defineConfig({
  plugins: [
    vue(),
  ],
  build: {
    test: 1,  
  }
})
  `,
      `import { sentryVitePlugin } from "@sentry/vite-plugin";
export default defineConfig({
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],
  build: {
    test: 1,
    sourcemap: true
  }
})`,
    ],
    [
      'keep sourcemap: "hidden"',
      `
export default {
  plugins: [
    vue(),
  ],
  build: {
    sourcemap: "hidden",
  }
}
    `,
      `import { sentryVitePlugin } from "@sentry/vite-plugin";
export default {
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],
  build: {
    sourcemap: "hidden",
  }
}`,
    ],
    [
      'rewrite sourcemap: false to true',
      `
const cfg = {
  plugins: [
    vue(),
  ],
  build: {
    sourcemap: false,
  }
}

export default cfg;
      `,
      `import { sentryVitePlugin } from "@sentry/vite-plugin";
const cfg = {
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],

  build: {
    sourcemap: true,
  }
}

export default cfg;`,
    ],
  ])(
    'adds the plugin and enables source maps generation (%s)',
    async (_, originalCode, expectedCode) => {
      updateFileContent(originalCode);

      const addedCode = await addVitePluginToConfig('', {
        authToken: '',
        orgSlug: 'my-org',
        projectSlug: 'my-project',
        selfHosted: false,
        url: 'https://sentry.io/',
      });

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      const [[, fileContent]] = writeFileSpy.mock.calls;
      expect(fileContent).toBe(expectedCode);
      expect(addedCode).toBe(true);
    },
  );
});
