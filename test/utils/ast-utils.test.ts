//@ts-ignore
import { parseModule } from 'magicast';
import { hasSentryContent } from '../../src/utils/ast-utils';

describe('AST utils', () => {
  describe('hasSentryContent', () => {
    it("returns true if a '@sentry/' import was found in the parsed module", () => {
      const code = `
        import { sentryVitePlugin } from "@sentry/vite-plugin";
        import * as somethingelse from 'gs';

        export default {
            plugins: [sentryVitePlugin()]
        }
      `;

      expect(hasSentryContent(parseModule(code))).toBe(true);
    });
    it.each([
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
      "reutrns false for modules without a valid '@sentry/' import",
      (code) => {
        expect(hasSentryContent(parseModule(code))).toBe(false);
      },
    );
  });
});
