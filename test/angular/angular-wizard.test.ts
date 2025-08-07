import { describe, expect, it, vi } from 'vitest';

import { buildOutroMessage } from '../../src/angular/angular-wizard';
import { getInitCallArgs } from '../../src/angular/codemods/main';

vi.mock('../../src/utils/clack/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined),
}));

describe('angular-wizard', () => {
  describe('buildOutroMessage', () => {
    it('returns the correct outro message if example component was created', () => {
      expect(buildOutroMessage(true)).toMatchInlineSnapshot(`
        "
        Successfully installed the Sentry Angular SDK!

        You can validate your setup by starting your dev environment (ng serve) and throwing an error in the example component.

        Check out the SDK documentation for further configuration:
        https://docs.sentry.io/platforms/javascript/guides/angular/"
      `);
    });
    it('returns the correct outro message if example component creation was skipped', () => {
      expect(buildOutroMessage(false)).toMatchInlineSnapshot(`
        "
        Successfully installed the Sentry Angular SDK!

        Check out the SDK documentation for further configuration:
        https://docs.sentry.io/platforms/javascript/guides/angular/"
      `);
    });
  });

  describe('getInitCallArgs', () => {
    it('returns the correct init call arguments when features are enabled', () => {
      const args = getInitCallArgs('https://example.com', {
        performance: true,
        replay: true,
        logs: true,
      });
      expect(args).toEqual(
        expect.objectContaining({
          sendDefaultPii: true,
        }),
      );
    });

    it('returns the correct init call arguments when features are disabled', () => {
      const args = getInitCallArgs('https://example.com', {
        performance: false,
        replay: false,
        logs: false,
      });

      expect(args).toEqual(
        expect.objectContaining({
          sendDefaultPii: true,
        }),
      );
    });
  });
});
