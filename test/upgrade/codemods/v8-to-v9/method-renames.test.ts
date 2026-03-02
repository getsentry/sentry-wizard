import { describe, it, expect } from 'vitest';
import { assertTransform, runTransform } from '../../test-utils.js';
import { methodRenames } from '../../../../src/upgrade/codemods/v8-to-v9/method-renames.js';

describe('method-renames v8→v9', () => {
  it('renames captureUserFeedback to captureFeedback', () => {
    const input = `import * as Sentry from '@sentry/browser';
Sentry.captureUserFeedback({ comments: 'bug here', name: 'Jane' });`;
    const expected = `import * as Sentry from '@sentry/browser';
Sentry.captureFeedback({ message: 'bug here', name: 'Jane' });`;
    assertTransform(methodRenames, input, expected);
  });

  it('renames comments field in captureFeedback object', () => {
    const input = `Sentry.captureUserFeedback({
  comments: feedback,
  email: user.email,
});`;
    const expected = `Sentry.captureFeedback({
  message: feedback,
  email: user.email,
});`;
    assertTransform(methodRenames, input, expected);
  });

  it('renames @WithSentry to @SentryExceptionCaptured', () => {
    const input = `import { WithSentry } from '@sentry/nestjs';`;
    const expected = `import { SentryExceptionCaptured } from '@sentry/nestjs';`;
    assertTransform(methodRenames, input, expected);
  });

  it('renames SentryGlobalGenericFilter to SentryGlobalFilter', () => {
    const input = `import { SentryGlobalGenericFilter } from '@sentry/nestjs';`;
    const expected = `import { SentryGlobalFilter } from '@sentry/nestjs';`;
    assertTransform(methodRenames, input, expected);
  });

  it('renames SentryGlobalGraphQLFilter to SentryGlobalFilter', () => {
    const input = `import { SentryGlobalGraphQLFilter } from '@sentry/nestjs';`;
    const expected = `import { SentryGlobalFilter } from '@sentry/nestjs';`;
    assertTransform(methodRenames, input, expected);
  });

  it('adds TODO for wrapUseRoutes (version-dependent)', () => {
    const input = `import { wrapUseRoutes } from '@sentry/react';`;
    const result = runTransform(methodRenames, input);
    expect(result.manualReviewItems.length).toBeGreaterThan(0);
    expect(result.manualReviewItems[0].description).toContain(
      'wrapUseRoutesV6 or wrapUseRoutesV7',
    );
  });

  it('adds TODO for wrapCreateBrowserRouter (version-dependent)', () => {
    const input = `import { wrapCreateBrowserRouter } from '@sentry/react';`;
    const result = runTransform(methodRenames, input);
    expect(result.manualReviewItems.length).toBeGreaterThan(0);
  });

  it('adds TODO for addOpenTelemetryInstrumentation', () => {
    const input = `import * as Sentry from '@sentry/node';
Sentry.addOpenTelemetryInstrumentation(new GenericPoolInstrumentation());`;
    const result = runTransform(methodRenames, input);
    expect(result.manualReviewItems.length).toBeGreaterThan(0);
    expect(result.manualReviewItems[0].description).toContain(
      'openTelemetryInstrumentations',
    );
  });
});
