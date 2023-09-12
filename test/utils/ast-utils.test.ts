import { hasSentryContent } from '../../src/utils/ast-utils';

import * as recast from 'recast';

describe('AST utils', () => {
  describe('hasSentryContent', () => {
    it.each([
      `
      const { sentryVitePlugin } = require("@sentry/vite-plugin");
      const somethingelse = require('gs');
    `,
      `
        import { sentryVitePlugin } from "@sentry/vite-plugin";
        import * as somethingelse from 'gs';

        export default {
            plugins: [sentryVitePlugin()]
        }
      `,
    ])(
      "returns true if a require('@sentry/') call was found in the parsed module",
      (code) => {
        // recast.parse returns a Program node (or fails) but it's badly typed as any
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const program = recast.parse(code)
          .program as recast.types.namedTypes.Program;
        expect(hasSentryContent(program)).toBe(true);
      },
    );

    it.each([
      `const whatever = require('something')`,
      `// const {sentryWebpackPlugin} = require('@sentry/webpack-plugin')`,
      `const {sAntryWebpackPlugin} = require('webpack-plugin-@sentry')`,
      `
      import * as somethingelse from 'gs';
      export default {
          plugins: []
      }
      `,
      `import * as somethingelse from 'gs';
       // import { sentryVitePlugin } from "@sentry/vite-plugin"
      export default {
          plugins: []
      }
      `,
      `import * as thirdPartyVitePlugin from "vite-plugin-@sentry"
      export default {
        plugins: [thirdPartyVitePlugin()]
      }
      `,
    ])(
      "returns false if the file doesn't contain any require('@sentry/') calls",
      (code) => {
        // recast.parse returns a Program node (or fails) but it's badly typed as any
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const program = recast.parse(code)
          .program as recast.types.namedTypes.Program;
        expect(hasSentryContent(program)).toBe(false);
      },
    );
  });
});
