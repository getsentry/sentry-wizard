import { describe, it, expect } from 'vitest';
import {
  assertTransform,
  assertNoChange,
  runTransform,
} from '../../test-utils.js';
import { configChanges } from '../../../../src/upgrade/codemods/v8-to-v9/config-changes.js';

describe('config-changes v8→v9', () => {
  it('replaces enableTracing: true with tracesSampleRate', () => {
    const input = `Sentry.init({
  dsn: '__DSN__',
  enableTracing: true,
});`;
    const expected = `Sentry.init({
  dsn: '__DSN__',
  // TODO(sentry-upgrade): 'enableTracing' was removed. Use tracesSampleRate instead.
  tracesSampleRate: 1,
});`;
    assertTransform(configChanges, input, expected);
  });

  it('removes enableTracing: false', () => {
    const input = `Sentry.init({
  dsn: '__DSN__',
  enableTracing: false,
});`;
    // Recast removes the trailing comma when the last prop is removed
    const expected = `Sentry.init({
  dsn: '__DSN__'
});`;
    assertTransform(configChanges, input, expected);
  });

  it('adds TODO for autoSessionTracking removal', () => {
    const input = `Sentry.init({
  dsn: '__DSN__',
  autoSessionTracking: true,
});`;
    const result = runTransform(configChanges, input);
    expect(result.manualReviewItems.length).toBeGreaterThan(0);
    expect(result.manualReviewItems[0].description).toContain(
      'autoSessionTracking',
    );
  });

  it('flattens transactionContext in tracesSampler', () => {
    const input = `Sentry.init({
  tracesSampler: (samplingContext) => {
    if (samplingContext.transactionContext.name === '/health-check') {
      return 0;
    }
    return 0.5;
  },
});`;
    const expected = `Sentry.init({
  tracesSampler: (samplingContext) => {
    if (samplingContext.name === '/health-check') {
      return 0;
    }
    return 0.5;
  },
});`;
    assertTransform(configChanges, input, expected);
  });

  it('removes hideSourceMaps option', () => {
    const input = `module.exports = withSentryConfig(nextConfig, {
  hideSourceMaps: true,
});`;
    // Recast collapses empty object to single line
    const expected = `module.exports = withSentryConfig(nextConfig, {});`;
    assertTransform(configChanges, input, expected);
  });

  it('removes autoInstrumentRemix option', () => {
    const input = `Sentry.init({
  dsn: '__DSN__',
  autoInstrumentRemix: true,
});`;
    const expected = `Sentry.init({
  dsn: '__DSN__'
});`;
    assertTransform(configChanges, input, expected);
  });

  it('does not modify init call without deprecated options', () => {
    const input = `Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
});`;
    assertNoChange(configChanges, input);
  });
});
