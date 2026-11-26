import type { SentryCli } from '../utils/bash';

export const SENTRY_CLI_INSTALL_DOCS_URL =
  'https://cli.sentry.dev/getting-started/';

export function getRunScriptTemplate(
  orgSlug: string,
  projectSlug: string,
  uploadSource: boolean,
  includeHomebrewPath: boolean,
): string {
  const includeHomebrew = includeHomebrewPath
    ? `
ARCH=$(uname -m)
if [ "$ARCH" = arm64 ]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi`
    : '';
  // Same command in v4 `sentry` and v2/v3 `sentry-cli`, with no --org or
  // --project flags. Both read the org and project from SENTRY_ORG and
  // SENTRY_PROJECT, which the script exports because CI has no .sentryclirc
  // (it is gitignored). Locally, Xcode runs the script in the project
  // directory, and both CLIs walk up from there to the .sentryclirc that the
  // wizard writes, which holds the auth token and [defaults] org and project.
  const upload = (binary: SentryCli['binary']) =>
    `  if ! ERROR=$(${binary} debug-files upload ${
      uploadSource ? '--include-sources ' : ''
    }"$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: ${binary} - $ERROR"
  fi`;
  return `# This script is responsible for uploading debug symbols and source context for Sentry.${includeHomebrew}
# The Sentry CLI installer can put sentry in ~/.local/bin, which Xcode does not add to PATH.
export PATH="$PATH:$HOME/.local/bin"

export SENTRY_ORG=${orgSlug}
export SENTRY_PROJECT=${projectSlug}
# Prefer the Sentry CLI v4 (sentry). The check skips unrelated sentry binaries.
if sentry debug-files --help >/dev/null 2>&1; then
${upload('sentry')}
elif command -v sentry-cli >/dev/null 2>&1; then
${upload('sentry-cli')}
else
  echo "warning: Sentry CLI not installed. Install it with: curl -fsS https://cli.sentry.dev/install | bash (see ${SENTRY_CLI_INSTALL_DOCS_URL})"
fi
`;
}

export const scriptInputPath =
  '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}"';

export function getSwiftSnippet(dsn: string, enableLogs: boolean): string {
  let snippet = `        SentrySDK.start { options in
            options.dsn = "${dsn}"

            // Adds IP for users.
            // For more information, visit: https://docs.sentry.io/platforms/apple/data-management/data-collected/
            options.sendDefaultPii = true

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
            // options.attachViewHierarchy = true // This adds the view hierarchy to the error events`;

  if (enableLogs) {
    snippet += `
            
            // Enable experimental logging features
            options.experimental.enableLogs = true`;
  }

  snippet += `
        }
        // Remove the next line after confirming that your Sentry integration is working.
        SentrySDK.capture(message: "This app uses Sentry! :)")\n`;

  return snippet;
}

export function getObjcSnippet(dsn: string, enableLogs: boolean): string {
  let snippet = `    [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"${dsn}";

        // Adds IP for users.
        // For more information, visit: https://docs.sentry.io/platforms/apple/data-management/data-collected/
        options.sendDefaultPii = YES;

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
        //options.attachViewHierarchy = YES; //This will add the view hierarchy to the error events`;

  if (enableLogs) {
    snippet += `
        
        // Enable experimental logging features
        options.experimental.enableLogs = YES;`;
  }

  snippet += `
    }];
    //Remove the next line after confirming that your Sentry integration is working.
    [SentrySDK captureMessage:@"This app uses Sentry!"];\n`;

  return snippet;
}

export function getFastlaneSnippet(org: string, project: string): string {
  return `    sentry_debug_files_upload(
      org_slug: '${org}',
      project_slug: '${project}',
      include_sources: true
    )`;
}
