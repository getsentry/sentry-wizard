/* eslint-disable no-useless-escape */
import {
  addSentryToBundleShellScript,
  doesBundlePhaseIncludeSentry,
  findBundlePhase,
  findDebugFilesUploadPhase,
  removeSentryFromBundleShellScript,
} from '../../src/react-native/xcode';

describe('react-native xcode', () => {
  describe('addSentryToBundleShellScript', () => {
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

      expect(addSentryToBundleShellScript(input)).toBe(expectedOutput);
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
