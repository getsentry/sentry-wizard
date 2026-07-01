import { beforeEach, describe, expect, it, vi } from 'vitest';

const wizardMocks = vi.hoisted(() => ({
  legacyRun: vi.fn(),
  readEnvironment: vi.fn(() => ({})),
  runAndroidWizard: vi.fn(),
  runAngularWizard: vi.fn(),
  runAppleSnapshotsWizard: vi.fn(),
  runAppleWizard: vi.fn(),
  runCloudflareWizard: vi.fn(),
  runFlutterWizard: vi.fn(),
  runNextjsWizard: vi.fn(),
  runNuxtWizard: vi.fn(),
  runReactNativeWizard: vi.fn(),
  runReactRouterWizard: vi.fn(),
  runRemixWizard: vi.fn(),
  runSourcemapsWizard: vi.fn(),
  runSvelteKitWizard: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: {
    error: vi.fn(),
  },
  outro: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../lib/Helper/Env', () => ({
  readEnvironment: wizardMocks.readEnvironment,
}));

vi.mock('../lib/Setup', () => ({
  run: wizardMocks.legacyRun,
}));

vi.mock('../src/android/android-wizard', () => ({
  runAndroidWizard: wizardMocks.runAndroidWizard,
}));

vi.mock('../src/angular/angular-wizard', () => ({
  runAngularWizard: wizardMocks.runAngularWizard,
}));

vi.mock('../src/apple/apple-wizard', () => ({
  runAppleWizard: wizardMocks.runAppleWizard,
}));

vi.mock('../src/apple/snapshots/apple-snapshots-wizard', () => ({
  runAppleSnapshotsWizard: wizardMocks.runAppleSnapshotsWizard,
}));

vi.mock('../src/cloudflare/cloudflare-wizard', () => ({
  runCloudflareWizard: wizardMocks.runCloudflareWizard,
}));

vi.mock('../src/flutter/flutter-wizard', () => ({
  runFlutterWizard: wizardMocks.runFlutterWizard,
}));

vi.mock('../src/nextjs/nextjs-wizard', () => ({
  runNextjsWizard: wizardMocks.runNextjsWizard,
}));

vi.mock('../src/nuxt/nuxt-wizard', () => ({
  runNuxtWizard: wizardMocks.runNuxtWizard,
}));

vi.mock('../src/react-native/react-native-wizard', () => ({
  runReactNativeWizard: wizardMocks.runReactNativeWizard,
}));

vi.mock('../src/react-router/react-router-wizard', () => ({
  runReactRouterWizard: wizardMocks.runReactRouterWizard,
}));

vi.mock('../src/remix/remix-wizard', () => ({
  runRemixWizard: wizardMocks.runRemixWizard,
}));

vi.mock('../src/sourcemaps/sourcemaps-wizard', () => ({
  runSourcemapsWizard: wizardMocks.runSourcemapsWizard,
}));

vi.mock('../src/sveltekit/sveltekit-wizard', () => ({
  runSvelteKitWizard: wizardMocks.runSvelteKitWizard,
}));

vi.mock('../src/utils/debug', () => ({
  enableDebugLogs: vi.fn(),
}));

vi.mock('../src/utils/clack', () => ({
  abortIfCancelled: async <T>(input: T | Promise<T>): Promise<T> => await input,
}));

import { run } from '../src/run';

type RunArgs = Parameters<typeof run>[0];

function getBaseArgs(integration: RunArgs['integration']): RunArgs {
  return {
    integration,
    uninstall: false,
    signup: false,
    skipConnect: false,
    debug: false,
    quiet: false,
    disableTelemetry: true,
  };
}

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wizardMocks.readEnvironment.mockReturnValue({});
  });

  it('routes appleSnapshots to the Apple Snapshots wizard with the Xcode project directory', async () => {
    await run({
      ...getBaseArgs('appleSnapshots'),
      xcodeProjectDir: '/tmp/MyApp',
    });

    expect(wizardMocks.runAppleSnapshotsWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetryEnabled: false,
        projectDir: '/tmp/MyApp',
      }),
    );
    expect(wizardMocks.runAppleWizard).not.toHaveBeenCalled();
  });

  it('keeps ios routing on the existing Apple wizard', async () => {
    await run({
      ...getBaseArgs('ios'),
      xcodeProjectDir: '/tmp/MyApp',
    });

    expect(wizardMocks.runAppleWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetryEnabled: false,
        projectDir: '/tmp/MyApp',
      }),
    );
    expect(wizardMocks.runAppleSnapshotsWizard).not.toHaveBeenCalled();
  });
});
