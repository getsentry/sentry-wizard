import { modifyViteConfig } from '../../src/sveltekit/sdk-setup';
import * as fs from 'fs';

describe('modifyViteConfig', () => {
  let fileContent = '';

  let modifiedFileContent = '';

  jest
    .spyOn(fs.promises, 'readFile')
    .mockImplementation(() => Promise.resolve(fileContent));

  jest.spyOn(fs.promises, 'writeFile').mockImplementation((_path, content) => {
    modifiedFileContent = content.toString();
    return Promise.resolve();
  });

  it('handles a vite config with `satisfies` keyword', async () => {
    fileContent = `// vite.config.ts
import { somePlugin1, somePlugin2 } from 'some-module'

import type { UserConfig } from 'vite';

const myConfig = defineConfig({
  plugins: [somePlugin1(), somePlugin2()]
}) satisfies UserConfig;

export default myConfig;`;

    await modifyViteConfig('', {
      dsn: 'some-dsn',
      org: 'some-org',
      project: 'some-project',
      url: 'https://sentry.io',
      selfHosted: false,
    });

    expect(modifiedFileContent).toMatchInlineSnapshot(`
      "import { sentrySvelteKit } from "@sentry/sveltekit";
      // vite.config.ts
      import { somePlugin1, somePlugin2 } from 'some-module'

      import type { UserConfig } from 'vite';

      const myConfig = defineConfig({
        plugins: [sentrySvelteKit({
          sourceMapsUploadOptions: {
            org: "some-org",
            project: "some-project"
          }
        }), somePlugin1(), somePlugin2()]
      }) satisfies UserConfig;

      export default myConfig;"
    `);
  });
});
