import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFastlaneSnippet,
  getObjcSnippet,
  getRunScriptTemplate,
  getSwiftSnippet,
  scriptInputPath,
} from '../../src/apple/templates';

vi.mock('../../src/utils/clack/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined),
}));

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
        expectedScript: `# This script is responsible for uploading debug symbols and source context for Sentry.
ARCH=$(uname -m)
if [ "$ARCH" = arm64 ]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi
# The Sentry CLI installer can put sentry in ~/.local/bin, which Xcode does not add to PATH.
export PATH="$PATH:$HOME/.local/bin"

export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
# Prefer the Sentry CLI v4 (sentry). The check skips unrelated sentry binaries.
if sentry debug-files --help >/dev/null 2>&1; then
  if ! ERROR=$(sentry debug-files upload --include-sources "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry - $ERROR"
  fi
elif command -v sentry-cli >/dev/null 2>&1; then
  if ! ERROR=$(sentry-cli debug-files upload --include-sources "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry-cli - $ERROR"
  fi
else
  echo "warning: Sentry CLI not installed. Install it with: curl -fsS https://cli.sentry.dev/install | bash (see https://cli.sentry.dev/getting-started/)"
fi
`,
      },
      {
        uploadSource: true,
        includeHomebrewPath: false,
        expectedScript: `# This script is responsible for uploading debug symbols and source context for Sentry.
# The Sentry CLI installer can put sentry in ~/.local/bin, which Xcode does not add to PATH.
export PATH="$PATH:$HOME/.local/bin"

export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
# Prefer the Sentry CLI v4 (sentry). The check skips unrelated sentry binaries.
if sentry debug-files --help >/dev/null 2>&1; then
  if ! ERROR=$(sentry debug-files upload --include-sources "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry - $ERROR"
  fi
elif command -v sentry-cli >/dev/null 2>&1; then
  if ! ERROR=$(sentry-cli debug-files upload --include-sources "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry-cli - $ERROR"
  fi
else
  echo "warning: Sentry CLI not installed. Install it with: curl -fsS https://cli.sentry.dev/install | bash (see https://cli.sentry.dev/getting-started/)"
fi
`,
      },
      {
        uploadSource: false,
        includeHomebrewPath: true,
        expectedScript: `# This script is responsible for uploading debug symbols and source context for Sentry.
ARCH=$(uname -m)
if [ "$ARCH" = arm64 ]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi
# The Sentry CLI installer can put sentry in ~/.local/bin, which Xcode does not add to PATH.
export PATH="$PATH:$HOME/.local/bin"

export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
# Prefer the Sentry CLI v4 (sentry). The check skips unrelated sentry binaries.
if sentry debug-files --help >/dev/null 2>&1; then
  if ! ERROR=$(sentry debug-files upload "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry - $ERROR"
  fi
elif command -v sentry-cli >/dev/null 2>&1; then
  if ! ERROR=$(sentry-cli debug-files upload "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry-cli - $ERROR"
  fi
else
  echo "warning: Sentry CLI not installed. Install it with: curl -fsS https://cli.sentry.dev/install | bash (see https://cli.sentry.dev/getting-started/)"
fi
`,
      },
      {
        uploadSource: false,
        includeHomebrewPath: false,
        expectedScript: `# This script is responsible for uploading debug symbols and source context for Sentry.
# The Sentry CLI installer can put sentry in ~/.local/bin, which Xcode does not add to PATH.
export PATH="$PATH:$HOME/.local/bin"

export SENTRY_ORG=test-org
export SENTRY_PROJECT=test-project
# Prefer the Sentry CLI v4 (sentry). The check skips unrelated sentry binaries.
if sentry debug-files --help >/dev/null 2>&1; then
  if ! ERROR=$(sentry debug-files upload "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry - $ERROR"
  fi
elif command -v sentry-cli >/dev/null 2>&1; then
  if ! ERROR=$(sentry-cli debug-files upload "$DWARF_DSYM_FOLDER_PATH" 2>&1 >/dev/null); then
    echo "warning: sentry-cli - $ERROR"
  fi
else
  echo "warning: Sentry CLI not installed. Install it with: curl -fsS https://cli.sentry.dev/install | bash (see https://cli.sentry.dev/getting-started/)"
fi
`,
      },
    ];

    for (const variation of variations) {
      describe(`uploadSource: ${variation.uploadSource.toString()} and includeHomebrewPath: ${variation.includeHomebrewPath.toString()}`, () => {
        it('should return the correct script', () => {
          // -- Act --
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

    describe('when run', () => {
      let tempDir: string;
      let binDir: string;
      let logPath: string;

      beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-script-'));
        binDir = path.join(tempDir, 'bin');
        fs.mkdirSync(binDir);
        logPath = path.join(tempDir, 'calls.log');
      });

      afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
      });

      // Adds a fake binary that logs its name, arguments, and org and project
      // env vars, then runs `body`.
      function addFakeBinary(dir: string, name: string, body = 'exit 0') {
        const binaryPath = path.join(dir, name);
        fs.writeFileSync(
          binaryPath,
          `#!/bin/sh\necho "${name} $* org=$SENTRY_ORG project=$SENTRY_PROJECT" >> "$LOG"\n${body}\n`,
        );
        fs.chmodSync(binaryPath, 0o755);
      }

      function runScript(): { stdout: string; calls: string[] } {
        const stdout = execFileSync(
          '/bin/sh',
          ['-c', getRunScriptTemplate('test-org', 'test-project', true, false)],
          {
            encoding: 'utf8',
            env: {
              PATH: `${binDir}:/usr/bin:/bin`,
              HOME: path.join(tempDir, 'home'),
              LOG: logPath,
              DWARF_DSYM_FOLDER_PATH: '/build/dSYMs',
            },
          },
        );
        const calls = fs.existsSync(logPath)
          ? fs.readFileSync(logPath, 'utf8').trimEnd().split('\n')
          : [];
        return { stdout, calls };
      }

      const sentryUpload =
        'sentry debug-files upload --include-sources /build/dSYMs org=test-org project=test-project';
      const sentryCheck =
        'sentry debug-files --help org=test-org project=test-project';
      const sentryCliUpload =
        'sentry-cli debug-files upload --include-sources /build/dSYMs org=test-org project=test-project';

      it('uploads with v4 sentry when it is installed', () => {
        addFakeBinary(binDir, 'sentry');

        const { stdout, calls } = runScript();

        expect(calls).toEqual([sentryCheck, sentryUpload]);
        expect(stdout).toBe('');
      });

      it('finds v4 sentry in ~/.local/bin', () => {
        const localBin = path.join(tempDir, 'home', '.local', 'bin');
        fs.mkdirSync(localBin, { recursive: true });
        addFakeBinary(localBin, 'sentry');

        const { calls } = runScript();

        expect(calls).toEqual([sentryCheck, sentryUpload]);
      });

      it('prefers v4 sentry when sentry-cli is also installed', () => {
        addFakeBinary(binDir, 'sentry');
        addFakeBinary(binDir, 'sentry-cli');

        const { calls } = runScript();

        expect(calls).toEqual([sentryCheck, sentryUpload]);
      });

      it('uploads with sentry-cli when it is the only CLI', () => {
        addFakeBinary(binDir, 'sentry-cli');

        const { stdout, calls } = runScript();

        expect(calls).toEqual([sentryCliUpload]);
        expect(stdout).toBe('');
      });

      it('skips an unrelated sentry binary and uses sentry-cli', () => {
        addFakeBinary(binDir, 'sentry', 'exit 2');
        addFakeBinary(binDir, 'sentry-cli');

        const { calls } = runScript();

        expect(calls).toEqual([sentryCheck, sentryCliUpload]);
      });

      it('prints a warning with v4 install instructions when no CLI is installed', () => {
        const { stdout, calls } = runScript();

        expect(calls).toEqual([]);
        expect(stdout).toBe(
          'warning: Sentry CLI not installed. Install it with: curl -fsS https://cli.sentry.dev/install | bash (see https://cli.sentry.dev/getting-started/)\n',
        );
      });

      it('turns a failed upload into an Xcode warning', () => {
        addFakeBinary(
          binDir,
          'sentry',
          'if [ "$2" = upload ]; then echo "upload failed" >&2; exit 1; fi',
        );

        const { stdout } = runScript();

        expect(stdout).toBe('warning: sentry - upload failed\n');
      });
    });
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
      const snippet = getSwiftSnippet('test-dsn', false);

      // -- Assert --
      expect(snippet).toBe(
        `        SentrySDK.start { options in
            options.dsn = "test-dsn"

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
            // options.attachViewHierarchy = true // This adds the view hierarchy to the error events
        }
        // Remove the next line after confirming that your Sentry integration is working.
        SentrySDK.capture(message: "This app uses Sentry! :)")
`,
      );
    });

    it('should return the correct snippet with logs enabled', () => {
      // -- Arrange --
      const snippet = getSwiftSnippet('test-dsn', true);

      // -- Assert --
      expect(snippet).toBe(
        `        SentrySDK.start { options in
            options.dsn = "test-dsn"

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
            // options.attachViewHierarchy = true // This adds the view hierarchy to the error events
            
            // Enable experimental logging features
            options.experimental.enableLogs = true
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
      const snippet = getObjcSnippet('test-dsn', false);

      // -- Assert --
      expect(snippet).toBe(
        `    [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"test-dsn";

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
        //options.attachViewHierarchy = YES; //This will add the view hierarchy to the error events
    }];
    //Remove the next line after confirming that your Sentry integration is working.
    [SentrySDK captureMessage:@"This app uses Sentry!"];
`,
      );
    });

    it('should return the correct snippet with logs enabled', () => {
      // -- Arrange --
      const snippet = getObjcSnippet('test-dsn', true);

      // -- Assert --
      expect(snippet).toBe(
        `    [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"test-dsn";

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
        //options.attachViewHierarchy = YES; //This will add the view hierarchy to the error events
        
        // Enable experimental logging features
        options.experimental.enableLogs = YES;
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
        `    sentry_debug_files_upload(
      org_slug: 'test-org',
      project_slug: 'test-project',
      include_sources: true
    )`,
      );
    });
  });
});
