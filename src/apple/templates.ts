export function getRunScriptTemplate(
  orgSlug: string,
  projectSlug: string,
  uploadSource: boolean,
  includeHomebrewPath: boolean,
): string {
  // eslint-disable-next-line no-useless-escape
  const includeHomebrew = includeHomebrewPath
    ? `
if [[ "$(uname -m)" == arm64 ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi
`
    : '';
  return `# This script is responsible for uploading debug symbols and source context for Sentry.${includeHomebrew}
if which sentry-cli >/dev/null; then
  export SENTRY_ORG=${orgSlug}
  export SENTRY_PROJECT=${projectSlug}
  ERROR=$(sentry-cli debug-files upload ${
    uploadSource ? '--include-sources ' : ''
  }"$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null)
  if [ ! $? -eq 0 ]; then
    echo "warning: sentry-cli - $ERROR"
  fi
else
  echo "warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases"
fi
`;
}

export const scriptInputPath =
  '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}"';

export function getSwiftSnippet(dsn: string, enableLogs: boolean): string {
  let snippet = `        SentrySDK.start { options in
            options.dsn = "${dsn}"
            options.debug = true // Enabled debug when first installing is always helpful

            // Adds IP for users.
            // For more information, visit: https://docs.sentry.io/platforms/apple/data-management/data-collected/
            options.sendDefaultPii = true`;

  if (enableLogs) {
    snippet += `
            options.experimental.enableLogs = true`;
  }

  snippet += `

            // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
            // We recommend adjusting this value in production.
            options.tracesSampleRate = 1.0

            // Configure profiling. Visit https://docs.sentry.io/platforms/apple/profiling/ to learn more.
            options.configureProfiling = {
                $0.sessionSampleRate = 1.0 // We recommend adjusting this value in production.
                $0.lifecycle = .trace
            }

            // Uncomment the following lines to add more data to your events
            // options.attachScreenshot = true // This adds a screenshot to the error events
            // options.attachViewHierarchy = true // This adds the view hierarchy to the error events
        }
        // Remove the next line after confirming that your Sentry integration is working.
        SentrySDK.capture(message: "This app uses Sentry! :)")\n`;

  return snippet;
}

export function getObjcSnippet(dsn: string, enableLogs: boolean): string {
  let snippet = `    [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"${dsn}";
        options.debug = YES; // Enabled debug when first installing is always helpful

        // Adds IP for users.
        // For more information, visit: https://docs.sentry.io/platforms/apple/data-management/data-collected/
        options.sendDefaultPii = YES;`;

  if (enableLogs) {
    snippet += `
        options.experimental.enableLogs = YES;`;
  }

  snippet += `

        // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
        // We recommend adjusting this value in production.
        options.tracesSampleRate = @1.0;

        // Configure profiling. Visit https://docs.sentry.io/platforms/apple/profiling/ to learn more.
        options.configureProfiling = ^(SentryProfileOptions *profiling) {
            profiling.sessionSampleRate = 1.0; // We recommend adjusting this value in production.
            profiling.lifecycle = SentryProfilingLifecycleTrace;
        };

        //Uncomment the following lines to add more data to your events
        //options.attachScreenshot = YES; //This will add a screenshot to the error events
        //options.attachViewHierarchy = YES; //This will add the view hierarchy to the error events
    }];
    //Remove the next line after confirming that your Sentry integration is working.
    [SentrySDK captureMessage:@"This app uses Sentry!"];\n`;

  return snippet;
}

export function getFastlaneSnippet(org: string, project: string): string {
  return `    sentry_cli(
      org_slug: '${org}',
      project_slug: '${project}',
      include_sources: true
    )`;
}
