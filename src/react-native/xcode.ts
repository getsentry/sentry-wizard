/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as fs from 'node:fs';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { makeCodeSnippet, showCopyPasteInstructions } from '../utils/clack';
import { Project } from 'xcode';
import * as Sentry from '@sentry/node';

type BuildPhase = { shellScript: string };
type BuildPhaseMap = Record<string, BuildPhase>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getValidExistingBuildPhases(xcodeProject: any): BuildPhaseMap {
  const map: BuildPhaseMap = {};
  const raw = xcodeProject.hash.project.objects.PBXShellScriptBuildPhase || {};
  for (const key in raw) {
    const val = raw[key];
    val.isa && (map[key] = val);
  }

  return map;
}

export class ErrorPatchSnippet {
  constructor(public snippet: string) {}
}

export async function patchBundlePhase(
  bundlePhase: BuildPhase | undefined,
  patch: (script: string) => string | ErrorPatchSnippet,
) {
  if (!bundlePhase) {
    clack.log.warn(
      `Could not find ${chalk.cyan(
        'Bundle React Native code and images',
      )} build phase.`,
    );
    return;
  }

  const bundlePhaseIncludesSentry = doesBundlePhaseIncludeSentry(bundlePhase);
  if (bundlePhaseIncludesSentry) {
    clack.log.warn(
      `Build phase ${chalk.cyan(
        'Bundle React Native code and images',
      )} already includes Sentry.`,
    );
    return;
  }

  const script: string = JSON.parse(bundlePhase.shellScript);
  const patchedScript = patch(script);
  if (patchedScript instanceof ErrorPatchSnippet) {
    await showCopyPasteInstructions({
      filename: 'Xcode project',
      codeSnippet: patchedScript.snippet,
      hint: `Apply in the 'Bundle React Native code and images' build phase`,
    });
    return;
  }
  bundlePhase.shellScript = JSON.stringify(patchedScript);
  clack.log.success(
    `Patched Build phase ${chalk.cyan('Bundle React Native code and images')}.`,
  );
}

export function unPatchBundlePhase(bundlePhase: BuildPhase | undefined) {
  if (!bundlePhase) {
    clack.log.warn(
      `Could not find ${chalk.cyan(
        'Bundle React Native code and images',
      )} build phase.`,
    );
    return;
  }

  if (
    !bundlePhase.shellScript.match(/sentry-cli\s+react-native\s+xcode/i) &&
    !bundlePhase.shellScript.includes('sentry-xcode.sh')
  ) {
    clack.log.success(
      `Build phase ${chalk.cyan(
        'Bundle React Native code and images',
      )} does not include Sentry.`,
    );
    return;
  }

  try {
    bundlePhase.shellScript = JSON.stringify(
      removeSentryFromBundleShellScript(
        <string>JSON.parse(bundlePhase.shellScript),
      ),
    );
    clack.log.success(
      `Build phase ${chalk.cyan(
        'Bundle React Native code and images',
      )} unpatched successfully.`,
    );
  } catch (error) {
    clack.log.error(
      `Failed to unpatch ${chalk.cyan(
        'Bundle React Native code and images',
      )} due to a json error.`,
    );
    Sentry.captureException('Error while unpatching bundle phase');
  }
}

export function removeSentryFromBundleShellScript(script: string): string {
  return (
    script
      // remove sentry properties export
      .replace(/^export SENTRY_PROPERTIES=sentry.properties\r?\n/m, '')
      .replace(
        /^\/bin\/sh .*?..\/node_modules\/@sentry\/react-native\/scripts\/collect-modules.sh"?\r?\n/m,
        '',
      )
      // unwrap react-native-xcode.sh command.  In case someone replaced it
      // entirely with the sentry-cli command we need to put the original
      // version back in.
      .replace(
        /\.\.\/node_modules\/@sentry\/cli\/bin\/sentry-cli\s+react-native\s+xcode\s+\$REACT_NATIVE_XCODE/i,
        '$REACT_NATIVE_XCODE',
      )
      .replace(
        //  eslint-disable-next-line no-useless-escape
        /\"\/bin\/sh.*?sentry-xcode.sh\s+\$REACT_NATIVE_XCODE/i,
        // eslint-disable-next-line no-useless-escape
        '"$REACT_NATIVE_XCODE',
      )
  );
}

export function findBundlePhase(buildPhases: BuildPhaseMap) {
  return Object.values(buildPhases).find((buildPhase) =>
    buildPhase.shellScript.match(/\/scripts\/react-native-xcode\.sh/i),
  );
}

export function doesBundlePhaseIncludeSentry(buildPhase: BuildPhase) {
  const containsSentryCliRNCommand = !!buildPhase.shellScript.match(
    /sentry-cli\s+react-native\s+xcode/i,
  );
  const containsBundledScript =
    buildPhase.shellScript.includes('sentry-xcode.sh');
  return containsSentryCliRNCommand || containsBundledScript;
}

export function addSentryWithBundledScriptsToBundleShellScript(
  script: string,
): string | ErrorPatchSnippet {
  let patchedScript = script;
  const isLikelyPlainReactNativeScript = script.includes('$REACT_NATIVE_XCODE');
  if (isLikelyPlainReactNativeScript) {
    patchedScript = script.replace(
      '$REACT_NATIVE_XCODE',
      // eslint-disable-next-line no-useless-escape
      '\\"/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh $REACT_NATIVE_XCODE\\"',
    );
  }

  const isLikelyExpoScript = script.includes('expo');
  if (isLikelyExpoScript) {
    const SENTRY_REACT_NATIVE_XCODE_PATH =
      "`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'\"`";
    patchedScript = script.replace(
      /^.*?(packager|scripts)\/react-native-xcode\.sh\s*(\\'\\\\")?/m,
      // eslint-disable-next-line no-useless-escape
      (match: string) => `/bin/sh ${SENTRY_REACT_NATIVE_XCODE_PATH} ${match}`,
    );
  }

  if (patchedScript === script) {
    // No changes were made
    clack.log.error(
      `Failed to patch ${chalk.cyan(
        'Bundle React Native code and images',
      )} build phase.`,
    );
    Sentry.captureException(
      `Failed to patch 'Bundle React Native code and images' build phase.`,
    );
    if (isLikelyExpoScript) {
      return new ErrorPatchSnippet(
        makeCodeSnippet(true, (unchanged, plus, _minus) => {
          return unchanged(
            `${plus(
              `/bin/sh \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'"\``,
            )} \`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"\``,
          );
        }),
      );
    } else {
      // plain react-native
      return new ErrorPatchSnippet(
        makeCodeSnippet(true, (unchanged, plus, _minus) => {
          return unchanged(`WITH_ENVIRONMENT="$REACT_NATIVE_PATH/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="$REACT_NATIVE_PATH/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT ${plus(
            `\\"/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh `,
          )}$REACT_NATIVE_XCODE${plus(`\\"`)}"
`);
        }),
      );
    }
  }

  return patchedScript;
}

export function addSentryWithCliToBundleShellScript(
  script: string,
): string | ErrorPatchSnippet {
  if (!script.includes('$REACT_NATIVE_XCODE')) {
    clack.log.error(
      `Could not find $REACT_NATIVE_XCODE in ${chalk.cyan(
        'Bundle React Native code and images',
      )} build phase. Skipping patching.`,
    );
    Sentry.captureException(
      `Could not find $REACT_NATIVE_XCODE in 'Bundle React Native code and images' build phase.`,
    );
    return new ErrorPatchSnippet(
      makeCodeSnippet(true, (unchanged, plus, _minus) => {
        return unchanged(`${plus(`export SENTRY_PROPERTIES=sentry.properties
export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
`)}
/bin/sh -c "$WITH_ENVIRONMENT ${plus(
          `\\"../node_modules/@sentry/cli/bin/sentry-cli react-native xcode`,
        )} $REACT_NATIVE_XCODE${plus(`\\"`)}"
${plus(
  `/bin/sh -c "$WITH_ENVIRONMENT ../node_modules/@sentry/react-native/scripts/collect-modules.sh"`,
)}
`);
      }),
    );
  }
  return (
    'export SENTRY_PROPERTIES=sentry.properties\n' +
    'export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"\n' +
    script.replace(
      '$REACT_NATIVE_XCODE',
      () =>
        // eslint-disable-next-line no-useless-escape
        '\\"../node_modules/@sentry/cli/bin/sentry-cli react-native xcode $REACT_NATIVE_XCODE\\"',
    ) +
    '\n/bin/sh -c "$WITH_ENVIRONMENT ../node_modules/@sentry/react-native/scripts/collect-modules.sh"\n'
  );
}

export function addDebugFilesUploadPhaseWithBundledScripts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xcodeProject: any,
  { debugFilesUploadPhaseExists }: { debugFilesUploadPhaseExists: boolean },
) {
  if (debugFilesUploadPhaseExists) {
    clack.log.warn(
      `Build phase ${chalk.cyan(
        'Upload Debug Symbols to Sentry',
      )} already exists.`,
    );
    return;
  }

  xcodeProject.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    'Upload Debug Symbols to Sentry',
    null,
    {
      shellPath: '/bin/sh',
      shellScript: `/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode-debug-files.sh`,
    },
  );
  clack.log.success(
    `Added Build phase ${chalk.cyan('Upload Debug Symbols to Sentry')}.`,
  );
}

export function addDebugFilesUploadPhaseWithCli(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xcodeProject: any,
  { debugFilesUploadPhaseExists }: { debugFilesUploadPhaseExists: boolean },
) {
  if (debugFilesUploadPhaseExists) {
    clack.log.warn(
      `Build phase ${chalk.cyan(
        'Upload Debug Symbols to Sentry',
      )} already exists.`,
    );
    return;
  }

  xcodeProject.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    'Upload Debug Symbols to Sentry',
    null,
    {
      shellPath: '/bin/sh',
      shellScript: `
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
if [ -f "$WITH_ENVIRONMENT" ]; then
  . "$WITH_ENVIRONMENT"
fi
export SENTRY_PROPERTIES=sentry.properties
[ "$SENTRY_INCLUDE_NATIVE_SOURCES" = "true" ] && INCLUDE_SOURCES_FLAG="--include-sources" || INCLUDE_SOURCES_FLAG=""
../node_modules/@sentry/cli/bin/sentry-cli debug-files upload "$INCLUDE_SOURCES_FLAG" "$DWARF_DSYM_FOLDER_PATH"
`,
    },
  );
  clack.log.success(
    `Added Build phase ${chalk.cyan('Upload Debug Symbols to Sentry')}.`,
  );
}

export function unPatchDebugFilesUploadPhase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xcodeProject: any,
) {
  const buildPhasesMap =
    xcodeProject.hash.project.objects.PBXShellScriptBuildPhase || {};

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const debugFilesUploadPhaseResult = findDebugFilesUploadPhase(buildPhasesMap);
  if (!debugFilesUploadPhaseResult) {
    clack.log.warn(
      `Build phase ${chalk.cyan('Upload Debug Symbols to Sentry')} not found.`,
    );
    return;
  }

  const [debugFilesUploadPhaseKey] = debugFilesUploadPhaseResult;
  const firstTarget: string = xcodeProject.getFirstTarget().uuid;
  const nativeTargets = xcodeProject.hash.project.objects.PBXNativeTarget;

  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete buildPhasesMap[debugFilesUploadPhaseKey];
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete buildPhasesMap[`${debugFilesUploadPhaseKey}_comment`];
  const phases = nativeTargets[firstTarget].buildPhases;
  if (phases) {
    for (let i = 0; i < phases.length; i++) {
      if (phases[i].value === debugFilesUploadPhaseKey) {
        phases.splice(i, 1);
        break;
      }
    }
  }
  clack.log.success(
    `Build phase ${chalk.cyan(
      'Upload Debug Symbols to Sentry',
    )} removed successfully.`,
  );
}

export function findDebugFilesUploadPhase(
  buildPhasesMap: Record<string, BuildPhase>,
): [key: string, buildPhase: BuildPhase] | undefined {
  return Object.entries(buildPhasesMap).find(([_, buildPhase]) => {
    const containsCliDebugUpload =
      typeof buildPhase !== 'string' &&
      !!buildPhase.shellScript.match(
        /sentry-cli\s+(upload-dsym|debug-files upload)\b/,
      );
    const containsBundledDebugUpload =
      typeof buildPhase !== 'string' &&
      buildPhase.shellScript.includes('sentry-xcode-debug-files.sh');
    return containsCliDebugUpload || containsBundledDebugUpload;
  });
}

export function writeXcodeProject(
  xcodeProjectPath: string,
  xcodeProject: Project,
) {
  try {
    const newContent = xcodeProject.writeSync();
    const currentContent = fs.readFileSync(xcodeProjectPath, 'utf-8');
    if (newContent === currentContent) {
      return;
    }

    fs.writeFileSync(xcodeProjectPath, newContent, 'utf-8');
    clack.log.success(
      chalk.green(
        `Xcode project ${chalk.cyan(xcodeProjectPath)} changes saved.`,
      ),
    );
  } catch (error) {
    clack.log.error(
      `Error while writing Xcode project ${chalk.cyan(xcodeProjectPath)}`,
    );
    Sentry.captureException('Error while writing Xcode project');
  }
}
