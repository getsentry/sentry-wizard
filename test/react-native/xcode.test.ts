/* eslint-disable no-useless-escape */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import {
  addSentryWithBundledScriptsToBundleShellScript,
  addSentryWithCliToBundleShellScript,
  doesBundlePhaseIncludeSentry,
  findBundlePhase,
  findDebugFilesUploadPhase,
  removeSentryFromBundleShellScript,
  ErrorPatchSnippet,
} from '../../src/react-native/xcode';
import chalk from 'chalk';
import { makeCodeSnippet } from '../../src/utils/clack';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

vi.mock('@clack/prompts', async () => ({
  __esModule: true,
  ...(await vi.importActual<typeof clack>('@clack/prompts')),
}));

describe('react-native xcode', () => {
  beforeEach(() => {
    vi.spyOn(clack.log, 'error').mockImplementation(() => {
      /* empty */
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addSentryWithCliToBundleShellScript', () => {
    it('adds sentry cli to rn bundle build phase', () => {
      const input = `set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT $REACT_NATIVE_XCODE"`;
      // actual shell script looks like this:
      // /bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""
      // but during parsing xcode library removes the quotes
      const expectedOutput = `export SENTRY_PROPERTIES=sentry.properties
export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \\"../node_modules/@sentry/cli/bin/sentry-cli react-native xcode $REACT_NATIVE_XCODE\\""
/bin/sh -c "$WITH_ENVIRONMENT ../node_modules/@sentry/react-native/scripts/collect-modules.sh"
`;

      expect(addSentryWithCliToBundleShellScript(input)).toBe(expectedOutput);
    });

    it('does not add sentry cli to rn bundle build phase if $REACT_NATIVE_XCODE is not present and shows code snippet', () => {
      const input = `set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT $NOT_REACT_NATIVE_XCODE"`;

      expect(addSentryWithCliToBundleShellScript(input)).toEqual(
        new ErrorPatchSnippet(
          makeCodeSnippet(true, (unchanged, plus, _minus) => {
            return unchanged(`${plus(`export SENTRY_PROPERTIES=sentry.properties
export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
`)}
/bin/sh -c "$WITH_ENVIRONMENT ${plus(
              `\\"../node_modules/@sentry/cli/bin/sentry-cli react-native xcode`,
            )} $REACT_NATIVE_XCODE${plus(`\\"`)}"
${plus(
  `/bin/sh -c "$WITH_ENVIRONMENT ../node_modules/@sentry/react-native/scripts/collect-modules.sh`,
)}"
`);
          }),
        ),
      );
      expect(clack.log.error).toHaveBeenCalledWith(
        `Could not find $REACT_NATIVE_XCODE in ${chalk.cyan(
          'Bundle React Native code and images',
        )} build phase. Skipping patching.`,
      );
    });
  });

  describe('addSentryBundledScriptsToBundleShellScript', () => {
    it('adds sentry cli to rn bundle build phase', () => {
      const input = `set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT $REACT_NATIVE_XCODE"`;
      // actual shell script looks like this:
      // /bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""
      // but during parsing xcode library removes the quotes
      const expectedOutput = `set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \\"/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh $REACT_NATIVE_XCODE\\""`;

      expect(addSentryWithBundledScriptsToBundleShellScript(input)).toBe(
        expectedOutput,
      );
    });

    it('does not add sentry cli to rn bundle build phase if $REACT_NATIVE_XCODE is not present and shows code snippet', () => {
      const input = `set -e
  
  WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
  REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"
  
  /bin/sh -c "$WITH_ENVIRONMENT $NOT_REACT_NATIVE_XCODE"`;

      expect(addSentryWithBundledScriptsToBundleShellScript(input)).toEqual(
        new ErrorPatchSnippet(
          makeCodeSnippet(true, (unchanged, plus, _minus) => {
            return unchanged(`WITH_ENVIRONMENT="$REACT_NATIVE_PATH/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="$REACT_NATIVE_PATH/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT ${plus(
              `\\"/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh `,
            )}$REACT_NATIVE_XCODE${plus(`\\"`)}"
`);
          }),
        ),
      );
      expect(clack.log.error).toHaveBeenCalledWith(
        `Failed to patch ${chalk.cyan(
          'Bundle React Native code and images',
        )} build phase.`,
      );
    });

    it('adds sentry cli to expo bundle build phase', () => {
      const input = `
if [[ -f "$PODS_ROOT/../.xcode.env" ]]; then
  source "$PODS_ROOT/../.xcode.env"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  source "$PODS_ROOT/../.xcode.env.local"
fi

# The project root by default is one level up from the ios directory
export PROJECT_ROOT="$PROJECT_DIR"/..

if [[ "$CONFIGURATION" = *Debug* ]]; then
  export SKIP_BUNDLING=1
fi
if [[ -z "$ENTRY_FILE" ]]; then
  # Set the entry JS file using the bundler's entry resolution.
  export ENTRY_FILE="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios absolute | tail -n 1)"
fi

if [[ -z "$CLI_PATH" ]]; then
  # Use Expo CLI
  export CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })")"
fi
if [[ -z "$BUNDLE_COMMAND" ]]; then
  # Default Expo CLI command for bundling
  export BUNDLE_COMMAND="export:embed"
fi

# Source .xcode.env.updates if it exists to allow
# SKIP_BUNDLING to be unset if needed
if [[ -f "$PODS_ROOT/../.xcode.env.updates" ]]; then
  source "$PODS_ROOT/../.xcode.env.updates"
fi
# Source local changes to allow overrides
# if needed
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  source "$PODS_ROOT/../.xcode.env.local"
fi

\`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"\`
`;

      const expectedOutput = `
if [[ -f "$PODS_ROOT/../.xcode.env" ]]; then
  source "$PODS_ROOT/../.xcode.env"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  source "$PODS_ROOT/../.xcode.env.local"
fi

# The project root by default is one level up from the ios directory
export PROJECT_ROOT="$PROJECT_DIR"/..

if [[ "$CONFIGURATION" = *Debug* ]]; then
  export SKIP_BUNDLING=1
fi
if [[ -z "$ENTRY_FILE" ]]; then
  # Set the entry JS file using the bundler's entry resolution.
  export ENTRY_FILE="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios absolute | tail -n 1)"
fi

if [[ -z "$CLI_PATH" ]]; then
  # Use Expo CLI
  export CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })")"
fi
if [[ -z "$BUNDLE_COMMAND" ]]; then
  # Default Expo CLI command for bundling
  export BUNDLE_COMMAND="export:embed"
fi

# Source .xcode.env.updates if it exists to allow
# SKIP_BUNDLING to be unset if needed
if [[ -f "$PODS_ROOT/../.xcode.env.updates" ]]; then
  source "$PODS_ROOT/../.xcode.env.updates"
fi
# Source local changes to allow overrides
# if needed
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  source "$PODS_ROOT/../.xcode.env.local"
fi

/bin/sh \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'"\` \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"\`
`;

      expect(addSentryWithBundledScriptsToBundleShellScript(input)).toBe(
        expectedOutput,
      );
    });

    it('if patching fails it does not add sentry cli to expo bundle build phase and shows code snippet', () => {
      const input = `
if [[ -f "$PODS_ROOT/../.xcode.env" ]]; then
  source "$PODS_ROOT/../.xcode.env"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  source "$PODS_ROOT/../.xcode.env.local"
fi

# The project root by default is one level up from the ios directory
export PROJECT_ROOT="$PROJECT_DIR"/..

if [[ "$CONFIGURATION" = *Debug* ]]; then
  export SKIP_BUNDLING=1
fi
if [[ -z "$ENTRY_FILE" ]]; then
  # Set the entry JS file using the bundler's entry resolution.
  export ENTRY_FILE="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios absolute | tail -n 1)"
fi
`;
      expect(addSentryWithBundledScriptsToBundleShellScript(input)).toEqual(
        new ErrorPatchSnippet(
          makeCodeSnippet(true, (unchanged, plus, _minus) => {
            return unchanged(
              `${plus(
                `/bin/sh \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'"\``,
              )} \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"\``,
            );
          }),
        ),
      );
      expect(clack.log.error).toHaveBeenCalledWith(
        `Failed to patch ${chalk.cyan(
          'Bundle React Native code and images',
        )} build phase.`,
      );
    });
  });

  describe('removeSentryFromBundleShellScript', () => {
    it('removes sentry cli from rn bundle build phase', () => {
      const input = `export SENTRY_PROPERTIES=sentry.properties
export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"../node_modules/@sentry/cli/bin/sentry-cli react-native xcode $REACT_NATIVE_XCODE\""

/bin/sh -c "$WITH_ENVIRONMENT ../node_modules/@sentry/react-native/scripts/collect-modules.sh"
`;
      const expectedOutput = `export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""

`;

      expect(removeSentryFromBundleShellScript(input)).toBe(expectedOutput);
    });

    it('removes sentry bundled scripts from rn bundle build phase', () => {
      const input = `set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh $REACT_NATIVE_XCODE\""`;
      const expectedOutput = `set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""`;

      expect(removeSentryFromBundleShellScript(input)).toBe(expectedOutput);
    });
  });

  describe('findBundlePhase', () => {
    it('returns build phase with react native xcode shell script', () => {
      const inputMap = {
        1: {
          shellScript: 'foo',
        },
        2: {
          shellScript: 'bar',
        },
        3: {
          shellScript: `set -e
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""

`,
        },
        4: {
          shellScript: 'qux',
        },
      };

      const expected = {
        shellScript: `set -e
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""

`,
      };

      expect(findBundlePhase(inputMap)).toEqual(expected);
    });

    it('returns undefined if bundle phase not present', () => {
      const inputMap = {
        1: {
          shellScript: 'foo',
        },
        2: {
          shellScript: 'bar',
        },
        3: {
          // note different path to the script
          shellScript: `set -e
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/unknown/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""

`,
        },
        4: {
          shellScript: 'qux',
        },
      };

      expect(findBundlePhase(inputMap)).toBeUndefined();
    });
  });

  describe('doesBundlePhaseIncludeSentry', () => {
    it('returns true for script containing sentry cli calling react native xcode command', () => {
      const input = {
        shellScript: `set -e
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"
SENTRY_CLI="sentry-cli react-native xcode"

/bin/sh -c "$WITH_ENVIRONMENT \"$SENTRY_CLI $REACT_NATIVE_XCODE\""
`,
      };
      expect(doesBundlePhaseIncludeSentry(input)).toBeTruthy();
    });

    it('returns true for script containing sentry bundled script', () => {
      const input = {
        shellScript: `set -e
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"
SENTRY_CLI="sentry-cli react-native xcode"

/bin/sh -c "$WITH_ENVIRONMENT \\"/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh $REACT_NATIVE_XCODE"\\"
`,
      };
      expect(doesBundlePhaseIncludeSentry(input)).toBeTruthy();
    });

    it('returns false', () => {
      const input = {
        // note sentry-cli can be part of the script but doesn't call react native xcode script
        shellScript: `set -e
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"$REACT_NATIVE_XCODE\""

sentry-cli --version
`,
      };
      expect(doesBundlePhaseIncludeSentry(input)).toBeFalsy();
    });
  });

  describe('findDebugFilesUploadPhase', () => {
    it('returns debug files build phase using debug files command', () => {
      const input = {
        1: {
          shellScript: 'foo',
        },
        2: {
          shellScript: `set -e
sentry-cli debug-files upload path/to/dsym --include-sources
`,
        },
      };
      const expected = [
        '2',
        {
          shellScript: `set -e
sentry-cli debug-files upload path/to/dsym --include-sources
`,
        },
      ];
      expect(findDebugFilesUploadPhase(input)).toEqual(expected);
    });

    it('returns debug files build phase with sentry-cli absolute path', () => {
      const input = {
        1: {
          shellScript: 'foo',
        },
        2: {
          shellScript: `set -e
/path/to/bin/sentry-cli debug-files upload path/to/dsym --include-sources
`,
        },
      };
      const expected = [
        '2',
        {
          shellScript: `set -e
/path/to/bin/sentry-cli debug-files upload path/to/dsym --include-sources
`,
        },
      ];
      expect(findDebugFilesUploadPhase(input)).toEqual(expected);
    });

    it('returns debug files build phase using dsym command', () => {
      const input = {
        1: {
          shellScript: 'foo',
        },
        2: {
          shellScript: `set -e
sentry-cli upload-dsym path/to/dsym --include-sources
`,
        },
      };
      const expected = [
        '2',
        {
          shellScript: `set -e
sentry-cli upload-dsym path/to/dsym --include-sources
`,
        },
      ];
      expect(findDebugFilesUploadPhase(input)).toEqual(expected);
    });

    it('returns debug files build phase using bundled scripts', () => {
      const input = {
        1: {
          shellScript: 'foo',
        },
        2: {
          shellScript: `/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode-debug-files.sh`,
        },
      };
      const expected = [
        '2',
        {
          shellScript: `/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode-debug-files.sh`,
        },
      ];
      expect(findDebugFilesUploadPhase(input)).toEqual(expected);
    });

    it('returns undefined if build phase not present', () => {
      const input = {
        1: {
          shellScript: 'foo',
        },
        2: {
          // sentry-cli present but with different command
          shellScript: 'sentry-cli sourcempas upload',
        },
      };

      expect(findDebugFilesUploadPhase(input)).toBeUndefined();
    });
  });
});
