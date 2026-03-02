import { describe, it } from 'vitest';
import { assertTransform, assertNoChange } from '../../test-utils.js';
import { packageRemapping } from '../../../../src/upgrade/codemods/v8-to-v9/package-remapping.js';

describe('package-remapping v8→v9', () => {
  // ESM imports
  it('remaps @sentry/utils to @sentry/core (ESM)', () => {
    const input = `import { addBreadcrumb } from "@sentry/utils";`;
    const expected = `import { addBreadcrumb } from "@sentry/core";`;
    assertTransform(packageRemapping, input, expected);
  });

  it('remaps @sentry/types to @sentry/core (ESM)', () => {
    const input = `import type { Event } from "@sentry/types";`;
    const expected = `import type { Event } from "@sentry/core";`;
    assertTransform(packageRemapping, input, expected);
  });

  it('remaps multiple imports from @sentry/utils', () => {
    const input = `import { addBreadcrumb, logger } from "@sentry/utils";`;
    const expected = `import { addBreadcrumb, logger } from "@sentry/core";`;
    assertTransform(packageRemapping, input, expected);
  });

  it('remaps namespace import from @sentry/utils', () => {
    const input = `import * as SentryUtils from "@sentry/utils";`;
    const expected = `import * as SentryUtils from "@sentry/core";`;
    assertTransform(packageRemapping, input, expected);
  });

  // CJS requires
  it('remaps require @sentry/utils to @sentry/core (CJS)', () => {
    const input = `const { addBreadcrumb } = require("@sentry/utils");`;
    const expected = `const { addBreadcrumb } = require("@sentry/core");`;
    assertTransform(packageRemapping, input, expected);
  });

  it('remaps require @sentry/types to @sentry/core (CJS)', () => {
    const input = `const { Event } = require("@sentry/types");`;
    const expected = `const { Event } = require("@sentry/core");`;
    assertTransform(packageRemapping, input, expected);
  });

  // No-op cases
  it('does not modify @sentry/browser imports', () => {
    const input = `import * as Sentry from "@sentry/browser";`;
    assertNoChange(packageRemapping, input);
  });

  it('does not modify @sentry/core imports', () => {
    const input = `import { addBreadcrumb } from "@sentry/core";`;
    assertNoChange(packageRemapping, input);
  });

  it('does not modify @sentry/node imports', () => {
    const input = `import * as Sentry from "@sentry/node";`;
    assertNoChange(packageRemapping, input);
  });
});
