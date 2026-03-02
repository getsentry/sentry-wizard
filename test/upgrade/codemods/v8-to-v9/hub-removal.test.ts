import { describe, it, expect } from 'vitest';
import { assertTransform, runTransform } from '../../test-utils.js';
import { hubRemoval } from '../../../../src/upgrade/codemods/v8-to-v9/hub-removal.js';

describe('hub-removal v8→v9', () => {
  it('replaces Sentry.getCurrentHub().captureException()', () => {
    const input = `import * as Sentry from '@sentry/browser';
Sentry.getCurrentHub().captureException(error);`;
    const expected = `import * as Sentry from '@sentry/browser';
Sentry.captureException(error);`;
    assertTransform(hubRemoval, input, expected);
  });

  it('replaces Sentry.getCurrentHub().captureMessage()', () => {
    const input = `import * as Sentry from '@sentry/browser';
Sentry.getCurrentHub().captureMessage('hello');`;
    const expected = `import * as Sentry from '@sentry/browser';
Sentry.captureMessage('hello');`;
    assertTransform(hubRemoval, input, expected);
  });

  it('replaces Sentry.getCurrentHub().getScope()', () => {
    const input = `import * as Sentry from '@sentry/browser';
const scope = Sentry.getCurrentHub().getScope();`;
    const expected = `import * as Sentry from '@sentry/browser';
const scope = Sentry.getCurrentScope();`;
    assertTransform(hubRemoval, input, expected);
  });

  it('replaces Sentry.getCurrentHub().getClient()', () => {
    const input = `import * as Sentry from '@sentry/browser';
const client = Sentry.getCurrentHub().getClient();`;
    const expected = `import * as Sentry from '@sentry/browser';
const client = Sentry.getClient();`;
    assertTransform(hubRemoval, input, expected);
  });

  it('replaces direct getCurrentHub() import call', () => {
    const input = `import { getCurrentHub } from '@sentry/browser';
getCurrentHub().captureMessage('hello');`;
    const expected = `import { captureMessage } from '@sentry/browser';
captureMessage('hello');`;
    assertTransform(hubRemoval, input, expected);
  });

  it('adds manual review for stored hub variable', () => {
    const input = `import * as Sentry from '@sentry/browser';
const hub = Sentry.getCurrentHub();
hub.captureException(error);`;
    const result = runTransform(hubRemoval, input);
    expect(result.manualReviewItems.length).toBeGreaterThan(0);
    expect(result.manualReviewItems[0].description).toContain('getCurrentHub');
  });

  it('replaces getCurrentHubShim() similarly', () => {
    const input = `import * as Sentry from '@sentry/core';
Sentry.getCurrentHubShim().captureException(error);`;
    const expected = `import * as Sentry from '@sentry/core';
Sentry.captureException(error);`;
    assertTransform(hubRemoval, input, expected);
  });
});
