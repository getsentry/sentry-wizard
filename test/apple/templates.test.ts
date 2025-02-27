import {
  getFastlaneSnippet,
  getObjcSnippet,
  getRunScriptTemplate,
  getSwiftSnippet,
  scriptInputPath,
} from '../../src/apple/templates';

describe('templates', () => {
  describe('getRunScriptTemplate', () => {
    const variations: {
      uploadSource: boolean;
      includeHomebrewPath: boolean;
      expectedScript: string;
    }[] = [
      {
        uploadSource: true,
        includeHomebrewPath: true,
        expectedScript:
          `# This script is responsable to upload debug symbols and source context for Sentry.
if [[ "$(uname -m)" == arm64 ]]; then
export PATH="/opt/homebrew/bin:$PATH"
fi
if which sentry-cli >/dev/null; then
export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
ERROR=$(sentry-cli debug-files upload --include-sources "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null)
if [ ! $? -eq 0 ]; then
echo "warning: sentry-cli - $ERROR"
fi
else
echo "warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases"
fi
`.replace(/\n/g, '\\n'),
      },
      {
        uploadSource: true,
        includeHomebrewPath: false,
        expectedScript:
          `# This script is responsable to upload debug symbols and source context for Sentry.
if which sentry-cli >/dev/null; then
export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
ERROR=$(sentry-cli debug-files upload --include-sources "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null)
if [ ! $? -eq 0 ]; then
echo "warning: sentry-cli - $ERROR"
fi
else
echo "warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases"
fi
`.replace(/\n/g, '\\n'),
      },
      {
        uploadSource: false,
        includeHomebrewPath: true,
        expectedScript:
          `# This script is responsable to upload debug symbols and source context for Sentry.
if [[ "$(uname -m)" == arm64 ]]; then
export PATH="/opt/homebrew/bin:$PATH"
fi
if which sentry-cli >/dev/null; then
export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
ERROR=$(sentry-cli debug-files upload "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null)
if [ ! $? -eq 0 ]; then
echo "warning: sentry-cli - $ERROR"
fi
else
echo "warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases"
fi
`.replace(/\n/g, '\\n'),
      },
      {
        uploadSource: false,
        includeHomebrewPath: false,
        expectedScript:
          `# This script is responsable to upload debug symbols and source context for Sentry.
if which sentry-cli >/dev/null; then
export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
ERROR=$(sentry-cli debug-files upload "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null)
if [ ! $? -eq 0 ]; then
echo "warning: sentry-cli - $ERROR"
fi
else
echo "warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases"
fi
`.replace(/\n/g, '\\n'),
      },
    ];

    for (const variation of variations) {
      describe(`uploadSource: ${variation.uploadSource.toString()} and includeHomebrewPath: ${variation.includeHomebrewPath.toString()}`, () => {
        it('should return the correct script', () => {
          // -- ct --
          const script = getRunScriptTemplate(
            'test-org',
            'test-project',
            variation.uploadSource,
            variation.includeHomebrewPath,
          );

          // -- Assert --
          expect(script).toBe(variation.expectedScript);
        });
      });
    }
  });

  describe('scriptInputPath', () => {
    it('should return the correct path', () => {
      expect(scriptInputPath).toBe(
        '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}"',
      );
    });
  });

  describe('getSwiftSnippet', () => {
    it('should return the correct snippet', () => {
      // -- Arrange --
      const snippet = getSwiftSnippet('test-dsn');

      // -- Assert --
      expect(snippet).toBe(
        `        SentrySDK.start { options in
            options.dsn = "test-dsn"
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
        SentrySDK.capture(message: "This app uses Sentry! :)")
`,
      );
    });
  });

  describe('getObjcSnippet', () => {
    it('should return the correct snippet', () => {
      // -- Arrange --
      const snippet = getObjcSnippet('test-dsn');

      // -- Assert --
      expect(snippet).toBe(
        `    [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"test-dsn";
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
    [SentrySDK captureMessage:@"This app uses Sentry!"];
`,
      );
    });
  });

  describe('getFastlaneSnippet', () => {
    it('should return the correct snippet', () => {
      // -- Arrange --
      const snippet = getFastlaneSnippet('test-org', 'test-project');

      // -- Assert --
      expect(snippet).toBe(
        `    sentry_cli(
      org_slug: 'test-org',
      project_slug: 'test-project',
      include_sources: true
    )`,
      );
    });
  });
});
