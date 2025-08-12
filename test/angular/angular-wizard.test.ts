import { describe, expect, it, vi } from 'vitest';

import { buildOutroMessage } from '../../src/angular/angular-wizard';

vi.mock('../../src/utils/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined),
}));

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
