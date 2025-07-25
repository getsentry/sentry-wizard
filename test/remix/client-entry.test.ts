// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import { updateEntryClientMod } from '../../src/remix/sdk-setup';
import { describe, expect, it } from 'vitest';

describe('initializeSentryOnEntryClient', () => {
  it('should initialize Sentry on client entry with all features enabled', () => {
    // Empty entry.client.tsx file for testing
    const originalEntryClientMod = parseModule('');

    const dsn = 'https://sentry.io/123';
    const selectedFeatures = {
      performance: true,
      replay: true,
      logs: true,
    };

    const result = updateEntryClientMod(
      originalEntryClientMod,
      dsn,
      selectedFeatures,
    );

    expect(result.generate().code).toMatchInlineSnapshot(`
      "import {  useEffect,} from "react";

      import {
        useLocation,
        useMatches,
      } from "@remix-run/react";

      import {  init, replayIntegration, browserTracingIntegration,} from "@sentry/remix";

      init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,
          enableLogs: true,

          integrations: [browserTracingIntegration({
            useEffect,
            useLocation,
            useMatches
          }), replayIntegration({
              maskAllText: true,
              blockAllMedia: true
          })],

          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1
      })"
    `);
  });

  it('should initialize Sentry on client entry when performance disabled', () => {
    // Empty entry.client.tsx file for testing
    const originalEntryClientMod = parseModule('');

    const dsn = 'https://sentry.io/123';
    const selectedFeatures = {
      performance: false,
      replay: true,
      logs: false,
    };

    const result = updateEntryClientMod(
      originalEntryClientMod,
      dsn,
      selectedFeatures,
    );

    expect(result.generate().code).toMatchInlineSnapshot(`
      "import {  init, replayIntegration,} from "@sentry/remix";

      init({
          dsn: "https://sentry.io/123",

          integrations: [replayIntegration({
              maskAllText: true,
              blockAllMedia: true
          })],

          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1
      })"
    `);
  });

  it('should initialize Sentry on client entry when replay disabled', () => {
    // Empty entry.client.tsx file for testing
    const originalEntryClientMod = parseModule('');

    const dsn = 'https://sentry.io/123';
    const selectedFeatures = {
      performance: true,
      replay: false,
      logs: false,
    };

    const result = updateEntryClientMod(
      originalEntryClientMod,
      dsn,
      selectedFeatures,
    );

    expect(result.generate().code).toMatchInlineSnapshot(`
      "import {  useEffect,} from "react";

      import {
        useLocation,
        useMatches,
      } from "@remix-run/react";

      import {  init, browserTracingIntegration,} from "@sentry/remix";

      init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,

          integrations: [browserTracingIntegration({
            useEffect,
            useLocation,
            useMatches
          })]
      })"
    `);
  });

  it('should initialize Sentry on client entry with only logs enabled', () => {
    // Empty entry.client.tsx file for testing
    const originalEntryClientMod = parseModule('');

    const dsn = 'https://sentry.io/123';
    const selectedFeatures = {
      performance: false,
      replay: false,
      logs: true,
    };

    const result = updateEntryClientMod(
      originalEntryClientMod,
      dsn,
      selectedFeatures,
    );

    expect(result.generate().code).toMatchInlineSnapshot(`
      "import {  init,} from "@sentry/remix";

      init({
          dsn: "https://sentry.io/123",
          enableLogs: true
      })"
    `);
  });

  it('should initialize Sentry on client entry with performance and logs enabled', () => {
    // Empty entry.client.tsx file for testing
    const originalEntryClientMod = parseModule('');

    const dsn = 'https://sentry.io/123';
    const selectedFeatures = {
      performance: true,
      replay: false,
      logs: true,
    };

    const result = updateEntryClientMod(
      originalEntryClientMod,
      dsn,
      selectedFeatures,
    );

    expect(result.generate().code).toMatchInlineSnapshot(`
      "import {  useEffect,} from "react";

      import {
        useLocation,
        useMatches,
      } from "@remix-run/react";

      import {  init, browserTracingIntegration,} from "@sentry/remix";

      init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,
          enableLogs: true,

          integrations: [browserTracingIntegration({
            useEffect,
            useLocation,
            useMatches
          })]
      })"
    `);
  });
});
