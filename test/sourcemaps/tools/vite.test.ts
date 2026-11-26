// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as fs from 'fs';
import { addVitePluginToConfig } from '../../../src/sourcemaps/tools/vite';

import { vi, it, describe, expect, afterEach } from 'vitest';

function updateFileContent(content: string): void {
  fileContent = content;
}

let fileContent = '';

vi.mock('@clack/prompts', () => {
  return {
    log: {
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    },
    select: vi.fn(() => Promise.resolve(true)),
    isCancel: vi.fn().mockReturnValue(false),
  };
});

vi.spyOn(fs.promises, 'readFile').mockImplementation(() =>
  Promise.resolve(fileContent),
);

const writeFileSpy = vi
  .spyOn(fs.promises, 'writeFile')
  .mockImplementation(() => Promise.resolve(void 0));

describe('addVitePluginToConfig', () => {
  afterEach(() => {
    fileContent = '';
    vi.clearAllMocks();
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
      `import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
export default defineConfig({
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],
})
`,
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
      `import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
export default defineConfig({
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],
  build: {
    test: 1,
  }
})
`,
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
      `import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
export default {
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],
  build: {
    sourcemap: "hidden",
  }
}
`,
    ],
    [
      'remove sourcemap: false after confirmation',
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
      `import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
const cfg = {
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],

  build: {}
}

export default cfg;
`,
    ],
    ...['true', "'inline'", "mode === 'development'"].map((value) => [
      `keep sourcemap: ${value}`,
      `
export default {
  plugins: [
    vue(),
  ],
  build: {
    sourcemap: ${value},
  }
}
`,
      `import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
export default {
  plugins: [vue(), sentryVitePlugin({
    org: "my-org",
    project: "my-project"
  })],
  build: {
    sourcemap: ${value},
  }
}
`,
    ]),
  ])(
    'adds the plugin without exposing source maps (%s)',
    async (_, originalCode, expectedCode) => {
      updateFileContent(originalCode);

      const addedCode = await addVitePluginToConfig(
        '',
        {
          authToken: '',
          orgSlug: 'my-org',
          projectSlug: 'my-project',
          selfHosted: false,
          url: 'https://sentry.io/',
        },
        '@sentry/bundler-plugins/vite',
      );

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      const [[, fileContent]] = writeFileSpy.mock.calls;
      expect(fileContent).toBe(expectedCode);
      expect(addedCode).toBe(true);
    },
  );

  it.each([
    [
      'object spread in the config',
      'export default defineConfig({ ...base, plugins: [] })',
      false,
    ],
    [
      'build is not an object',
      'export default defineConfig({ plugins: [], build: getBuild() })',
      false,
    ],
    [
      'object spread next to sourcemap: false',
      'export default defineConfig({ plugins: [], build: { ...b, sourcemap: false } })',
      true,
    ],
  ])(
    'adds the plugin if the config contains code it cannot analyze (%s)',
    async (_, originalCode, asksToRemove) => {
      updateFileContent(originalCode);

      const addedCode = await addVitePluginToConfig(
        '',
        {
          authToken: '',
          orgSlug: 'my-org',
          projectSlug: 'my-project',
          selfHosted: false,
          url: 'https://sentry.io/',
        },
        '@sentry/bundler-plugins/vite',
      );

      expect(addedCode).toBe(true);
      expect(clack.select).toHaveBeenCalledTimes(asksToRemove ? 1 : 0);
      const [[, fileContent]] = writeFileSpy.mock.calls;
      expect(fileContent).toContain('sentryVitePlugin(');
      expect(fileContent).not.toContain('sourcemap: false');
    },
  );

  it('keeps sourcemap: false if the user declines', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce(false);
    updateFileContent(`export default { build: { sourcemap: false } }`);

    const addedCode = await addVitePluginToConfig(
      '',
      {
        authToken: '',
        orgSlug: 'my-org',
        projectSlug: 'my-project',
        selfHosted: false,
        url: 'https://sentry.io/',
      },
      '@sentry/bundler-plugins/vite',
    );

    expect(clack.select).toHaveBeenCalledTimes(1);
    const [[, fileContent]] = writeFileSpy.mock.calls;
    expect(fileContent).toContain('sourcemap: false');
    expect(fileContent).toContain('sentryVitePlugin(');
    expect(addedCode).toBe(true);
  });
});
