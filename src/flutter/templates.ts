export const sentryImport = `import 'package:sentry_flutter/sentry_flutter.dart';\n`;

export function pubspecOptions(project: string, org: string): string {
  return `sentry:
  upload_source_maps: true
  upload_sources: true
  project: ${project}
  org: ${org}
`
}

export function sentryProperties(authToken: string): string {
  return `auth_token=${authToken}`;
}

export function initSnippet(
  dsn: string,
  selectedFeaturesMap: {
    tracing: boolean;
    profiling: boolean;
    replay: boolean;
  },
  runApp: string,
): string {
  let snippet = `await SentryFlutter.init(
    (options) {
      options.dsn = '${dsn}';`

  if (selectedFeaturesMap.tracing) {
    snippet += `
      // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
      // We recommend adjusting this value in production.
      options.tracesSampleRate = 1.0;`;
  }

  if (selectedFeaturesMap.profiling && selectedFeaturesMap.tracing) {
    snippet += `
      // The sampling rate for profiling is relative to tracesSampleRate
      // Setting to 1.0 will profile 100% of sampled transactions:
      options.profilesSampleRate = 1.0;`;
  }

  if (selectedFeaturesMap.replay) {
    snippet += `
      options.experimental.replay.sessionSampleRate = 1.0;
      options.experimental.replay.onErrorSampleRate = 1.0;`;
  }

  snippet += `
    },
    appRunner: () => runApp(${runApp}),
  );
  // TODO: Remove this line after sending the first sample event to sentry.
  await Sentry.captureMessage('This is a sample exception.');`

  return snippet;
}
