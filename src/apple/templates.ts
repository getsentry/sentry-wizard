export function getRunScriptTemplate(
  orgSlug: string,
  projectSlug: string,
  uploadSource: boolean,
  includeHomebrewPath: boolean,
): string {
  // eslint-disable-next-line no-useless-escape
  const includeHomebrew = includeHomebrewPath
    ? '\\nif [[ "$(uname -m)" == arm64 ]]; then\\nexport PATH="/opt/homebrew/bin:$PATH"\\nfi'
    : '';
  return `# This script is responsible to upload debug symbols and source context for Sentry.${includeHomebrew}\\nif which sentry-cli >/dev/null; then\\nexport SENTRY_ORG=${orgSlug}\\nexport SENTRY_PROJECT=${projectSlug}\\nERROR=$(sentry-cli debug-files upload ${
    uploadSource ? '--include-sources ' : ''
  }"$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null)\\nif [ ! $? -eq 0 ]; then\\necho "warning: sentry-cli - $ERROR"\\nfi\\nelse\\necho "warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases"\\nfi\\n`;
}

export const scriptInputPath =
  '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}"';

export function getSwiftSnippet(dsn: string): string {
  return `        SentrySDK.start { options in
            options.dsn = "${dsn}"
            options.debug = true // Enabled debug when first installing is always helpful
            // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
            // We recommend adjusting this value in production.
            options.tracesSampleRate = 1.0

            // Sample rate for profiling, applied on top of TracesSampleRate.
            // We recommend adjusting this value in production.
            options.profilesSampleRate = 1.0 

            // Uncomment the following lines to add more data to your events
            // options.attachScreenshot = true // This adds a screenshot to the error events
            // options.attachViewHierarchy = true // This adds the view hierarchy to the error events
        }
        // Remove the next line after confirming that your Sentry integration is working.
        SentrySDK.capture(message: "This app uses Sentry! :)")\n`;
}

export function getObjcSnippet(dsn: string): string {
  return `    [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"${dsn}";
        options.debug = YES; // Enabled debug when first installing is always helpful
        // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
        // We recommend adjusting this value in production.
        options.tracesSampleRate = @1.0;

        // Sample rate for profiling, applied on top of TracesSampleRate.
        // We recommend adjusting this value in production.
        options.profilesSampleRate = @1.0;

        //Uncomment the following lines to add more data to your events
        //options.attachScreenshot = YES; //This will add a screenshot to the error events
        //options.attachViewHierarchy = YES; //This will add the view hierarchy to the error events
    }];
    //Remove the next line after confirming that your Sentry integration is working.
    [SentrySDK captureMessage:@"This app uses Sentry!"];\n`;
}

export function getFastlaneSnippet(org: string, project: string): string {
  return `    sentry_cli(
      org_slug: '${org}',
      project_slug: '${project}',
      include_sources: true
    )`;
}
