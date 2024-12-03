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

export function initSnippet(dsn: string, runApp: string): string {
  return `await SentryFlutter.init(
    (options) {
      options.dsn = '${dsn}';
      // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
      // We recommend adjusting this value in production.
      options.tracesSampleRate = 1.0;
      // The sampling rate for profiling is relative to tracesSampleRate
      // Setting to 1.0 will profile 100% of sampled transactions:
      // Note: Profiling alpha is available for iOS and macOS since SDK version 7.12.0
      options.profilesSampleRate = 1.0;
    },
    appRunner: () => runApp(${runApp}),
  );
  // TODO: Remove this line after sending the first sample event to sentry.
  Sentry.captureMessage('This is a sample exception.');
`
}
