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

      import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,

          integrations: [Sentry.browserTracingIntegration({
            useEffect,
            useLocation,
            useMatches
          }), Sentry.replayIntegration({
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
    };

    const result = updateEntryClientMod(
      originalEntryClientMod,
      dsn,
      selectedFeatures,
    );

    expect(result.generate().code).toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",

          integrations: [Sentry.replayIntegration({
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

      import * as Sentry from "@sentry/remix";

      Sentry.init({
          dsn: "https://sentry.io/123",
          tracesSampleRate: 1,

          integrations: [Sentry.browserTracingIntegration({
            useEffect,
            useLocation,
            useMatches
          })]
      })"
    `);
  });
});
