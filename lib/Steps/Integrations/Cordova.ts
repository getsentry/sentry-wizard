import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Answers } from 'inquirer';

import type { Args } from '../../Constants';
import { exists, matchesContent, patchMatchingFile } from '../../Helper/File';
import { green } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

import xcode from 'xcode';
import type { PBXShellScriptBuildPhase } from 'xcode';

export class Cordova extends BaseIntegration {
  protected _sentryCli: SentryCli;

  protected _folderPrefix = 'platforms';
  protected _pluginFolder: string[] = ['.'];

  public constructor(protected _argv: Args) {
    super(_argv);
    this._sentryCli = new SentryCli(this._argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    if (this._argv.uninstall) {
      return this.uninstall(answers);
    }

    const sentryCliProperties =
      this._sentryCli.convertAnswersToProperties(answers);

    await patchMatchingFile(
      `${this._folderPrefix}/ios/*.xcodeproj/project.pbxproj`,
      this._patchXcodeProj.bind(this),
    );

    await this._addSentryProperties(sentryCliProperties);
    green('Successfully set up for cordova');

    return {};
  }

  public async uninstall(_answers: Answers): Promise<Answers> {
    await patchMatchingFile(
      '**/*.xcodeproj/project.pbxproj',
      this._unpatchXcodeProj.bind(this),
    );

    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

    let result = false;
    if (!exists(path.join('sentry.properties'))) {
      result = true;
      this.debug('sentry.properties not exists');
    }

    if (
      !matchesContent('**/*.xcodeproj/project.pbxproj', /SENTRY_PROPERTIES/gi)
    ) {
      result = true;
      this.debug('**/*.xcodeproj/project.pbxproj not matched');
    }

    if (this._argv.uninstall) {
      // if we uninstall we need to invert the result so we remove already patched
      result = !result;
    }

    this._shouldConfigure = Promise.resolve({ cordova: result });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return this.shouldConfigure;
  }

  private _unpatchXcodeProj(filename: string): Promise<string> {
    const proj = xcode.project(filename);
    return new Promise((resolve, reject) => {
      proj.parse((err: any) => {
        if (err) {
          reject(err);
          return;
        }

        this._unpatchXcodeBuildScripts(proj);
        resolve(proj.writeSync());
      });
    });
  }

  private _unpatchXcodeBuildScripts(proj: any): void {
    const scripts = proj.hash.project.objects.PBXShellScriptBuildPhase || {};
    const firstTarget = proj.getFirstTarget().uuid;
    const nativeTargets = proj.hash.project.objects.PBXNativeTarget;

    // scripts to kill entirely.
    for (const key of Object.keys(scripts)) {
      const script = scripts[key];

      // ignore comments and keys that got deleted
      if (typeof script === 'string' || script === undefined) {
        continue;
      }

      if (
        script.shellScript.match(/SENTRY_PROPERTIES/) ||
        script.shellScript.match(/SENTRY_FRAMEWORK_PATCH/)
      ) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete scripts[key];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete scripts[`${key}_comment`];
        const phases = nativeTargets[firstTarget].buildPhases;
        if (phases) {
          for (let i = 0; i < phases.length; i++) {
            if (phases[i].value === key) {
              phases.splice(i, 1);
              break;
            }
          }
        }
        continue;
      }
    }
  }

  private _patchXcodeProj(
    contents: string,
    filename: string,
  ): Promise<void | string> {
    const proj = xcode.project(filename);
    return new Promise((resolve, reject) => {
      proj.parse((err: any) => {
        if (err) {
          reject(err);
          return;
        }

        const xcodeSymbolscriptPath = `${process.cwd()}/plugins/sentry-cordova/scripts/xcode-upload-debug-files.sh`;

        if (!fs.existsSync(xcodeSymbolscriptPath)) {
          this.debug(`file ${xcodeSymbolscriptPath} not found.`);
          reject(
            'This version of wizard requires Sentry Cordova 1.4.2 or higher, please use an older version of sentry wizard or upgrade sentry cordova.',
          );
          return;
        }

        const buildScripts = [];
        for (const val of Object.values(
          proj.hash.project.objects.PBXShellScriptBuildPhase || {},
        )) {
          if ((val as PBXShellScriptBuildPhase).isa) {
            buildScripts.push(val);
          }
        }

        this._addNewXcodeBuildPhaseForSymbols(buildScripts, proj);
        this._addNewXcodeBuildPhaseForStripping(
          buildScripts,
          proj,
          xcodeSymbolscriptPath,
        );

        // we always modify the xcode file in memory but we only want to save it
        // in case the user wants configuration for ios.  This is why we check
        // here first if changes are made before we might prompt the platform
        // continue prompt.
        const newContents = proj.writeSync();
        if (newContents === contents) {
          resolve();
        } else {
          resolve(newContents);
        }
      });
    });
  }

  private _addNewXcodeBuildPhaseForSymbols(buildScripts: any, proj: any): void {
    for (const script of buildScripts) {
      if (script.shellScript.match(/SENTRY_PROPERTIES/)) {
        return;
      }
    }
    path.join(process.cwd(), 'sentry.properties');
    proj.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript:
          // eslint-disable-next-line prefer-template
          '#!/bin/bash\\n' +
          '# print commands before executing them and stop on first error\\n' +
          'set -x -e\\n' +
          'echo "warning: uploading debug symbols - set SENTRY_SKIP_DSYM_UPLOAD=true to skip this"\\n' +
          '[ -z "$SENTRY_FORCE_FOREGROUND"] && SENTRY_FORCE_FOREGROUND=true\\n' +
          '[[ "$SENTRY_FORCE_FOREGROUND" == true ]] && SENTRY_FORCE_FOREGROUND_FLAG="--force-foreground"\\n' +
          'get_node_command() {\\n' +
          '  if [ -x "$(command -v ${NODE_BINARY})" ]; then\\n' +
          '    echo "${NODE_BINARY}"\\n' +
          '    return 0\\n' +
          '  fi\\n' +
          '  if [ -x "$(which node)" ]; then\\n' +
          '    echo "node"\\n' +
          '    return 0\\n' +
          '  fi\\n' +
          '  NVM_NODE_VERSIONS_DIR="$HOME/.nvm/versions/node"\\n' +
          '  if [ -d "$NVM_NODE_VERSIONS_DIR" ] && [ "$(ls -A $NVM_NODE_VERSIONS_DIR)" ]; then\\n' +
          '    HIGHEST_VERSION=$(ls -v "$NVM_NODE_VERSIONS_DIR" | tail -n 1)\\n' +
          '    NODE_BINARY="$NVM_NODE_VERSIONS_DIR/$HIGHEST_VERSION/bin/node"\\n' +
          '    if [ -x "$NODE_BINARY" ]; then\\n' +
          '      echo "$NODE_BINARY"\\n' +
          '      return 0\\n' +
          '    fi\\n' +
          '  fi\\n' +
          '  echo ""\\n' +
          '  return 0\\n' +
          '}\\n' +
          'LOCAL_NODE_BINARY=$(get_node_command)\\n' +
          'if [ -z "$LOCAL_NODE_BINARY" ]; then\\n' +
          '  echo "warning: SENTRY: Node.js binary not found! Skipping symbol upload."\\n' +
          '  exit 0\\n' +
          'else\\n' +
          '  echo "Using Node.js from ${LOCAL_NODE_BINARY}"\\n' +
          'fi\\n' +
          'if [ -z "$SENTRY_PROPERTIES" ]; then\\n' +
          '  if [ -f "./sentry.properties" ]; then\\n' +
          '    export SENTRY_PROPERTIES=sentry.properties\\n' +
          '  elif [ -f "../../sentry.properties" ]; then\\n' +
          '    export SENTRY_PROPERTIES=../../sentry.properties\\n' +
          '  else\\n' +
          '    echo "warning: SENTRY: sentry.properties file not found! Skipping symbol upload."\\n' +
          '    exit 0\\n' +
          '  fi\\n' +
          'fi\\n' +
          'echo "sentry properties found at : $(readlink -f ${SENTRY_PROPERTIES})"\\n' +
          '[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_PACKAGE_PATH=$("$LOCAL_NODE_BINARY" --print "require(\'path\').dirname(require.resolve(\'@sentry/cli/package.json\'))")\\n' +
          '[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_EXECUTABLE="${SENTRY_CLI_PACKAGE_PATH}/bin/sentry-cli"\\n' +
          'SENTRY_COMMAND="${SENTRY_CLI_EXECUTABLE} upload-dsym $SENTRY_FORCE_FOREGROUND_FLAG"\\n' +
          'if [ "$SENTRY_SKIP_DSYM_UPLOAD" != true ]; then\\n' +
          '  set +x +e\\n' +
          '  SENTRY_XCODE_COMMAND_OUTPUT=$(/bin/sh -c "$LOCAL_NODE_BINARY  $SENTRY_COMMAND"  2>&1)\\n' +
          '  if [ $? -eq 0 ]; then\\n' +
          '    echo "$SENTRY_XCODE_COMMAND_OUTPUT"\\n' +
          '    echo "$SENTRY_XCODE_COMMAND_OUTPUT" | awk \'{print "output: sentry-cli - " $0}\'\\n' +
          '  else\\n' +
          '    echo "error: sentry-cli - To disable debug symbols upload, set SENTRY_SKIP_DSYM_UPLOAD=true in your environment variables. Or to allow failing upload, set SENTRY_ALLOW_FAILURE=true"\\n' +
          '    echo "error: sentry-cli - $SENTRY_XCODE_COMMAND_OUTPUT"\\n' +
          '  fi\\n' +
          '  set -x -e\\n' +
          'else\\n' +
          '  echo "SENTRY_SKIP_DSYM_UPLOAD=true, skipping debug symbols upload"\\n' +
          'fi',
      },
    );
  }

  private _addNewXcodeBuildPhaseForStripping(
    buildScripts: any,
    proj: any,
    xcodeSymbolScriptPath: string,
  ): void {
    for (const script of buildScripts) {
      if (script.shellScript.match(/SENTRY_FRAMEWORK_PATCH/)) {
        return;
      }
    }

    this.debug(" applyying xcode stuff");
    const script = xcodeSymbolScriptPath
      .split('\n')
      .map((line: string) => line.replace(/'/g, "\\'"))
      .join('\\n');

    // http://ikennd.ac/blog/2015/02/stripping-unwanted-architectures-from-dynamic-libraries-in-xcode/
    proj.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Sentry strip unused archs from Framework',
      null,
      {
        shellPath: '/bin/sh',
        shellScript: script,
      },
    );
  }

  private _addSentryProperties(properties: any): Promise<void> {
    let rv = Promise.resolve();
    const fn = path.join('sentry.properties');
    if (exists(fn)) {
      return rv;
    }
    rv = rv.then(() =>
      fs.writeFileSync(fn, this._sentryCli.dumpProperties(properties)),
    );

    return rv;
  }
}
