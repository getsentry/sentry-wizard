import { describe, it, expect } from 'vitest';
import { _enableTracingAndInstrumentationInConfig } from '../../../src/sveltekit/sdk-setup/svelte-config';

describe('_enableTracingAndInstrumentationInConfig', () => {
  it('handles default config', () => {
    const originalConfig = `/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter(),
  },
};

export default config;
`;

    const modifiedConfig =
      _enableTracingAndInstrumentationInConfig(originalConfig);

    expect(modifiedConfig).toMatchInlineSnapshot(`
      "/** @type {import('@sveltejs/kit').Config} */
      const config = {
        preprocess: vitePreprocess(),

        kit: {
          adapter: adapter(),
        },
      };

      export default config;"
    `);
  });
});
