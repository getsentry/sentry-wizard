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

        const xcodeSourceScriptPath = path.join(
          process.cwd(),
          'plugins/sentry-cordova/scripts',
          'xcode-upload-debug-files.sh',
        );

        if (!fs.existsSync(xcodeSourceScriptPath)) {
          this.debug(`file ${xcodeSourceScriptPath} not found.`);
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

        this._addNewXcodeBuildPhaseForSymbols(
          buildScripts,
          proj,
          xcodeSourceScriptPath,
        );
        this._addNewXcodeBuildPhaseForStripping(buildScripts, proj);

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

  private _addNewXcodeBuildPhaseForSymbols(
    buildScripts: any,
    proj: any,
    xcodeSymbolScriptPath: string,
  ): void {
    for (const script of buildScripts) {
      if (script.shellScript.match(/SENTRY_PROPERTIES/)) {
        return;
      }
    }

    const script = fs
      .readFileSync(xcodeSymbolScriptPath, 'utf8')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n');

    proj.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript: script,
      },
    );
  }

  private _addNewXcodeBuildPhaseForStripping(
    buildScripts: any,
    proj: any,
  ): void {
    for (const script of buildScripts) {
      if (script.shellScript.match(/SENTRY_FRAMEWORK_PATCH/)) {
        return;
      }
    }

    // http://ikennd.ac/blog/2015/02/stripping-unwanted-architectures-from-dynamic-libraries-in-xcode/
    proj.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Sentry strip unused archs from Framework',
      null,
      {
        shellPath: '/bin/sh',
        shellScript:
          '# SENTRY_FRAMEWORK_PATCH \\n' +
          'echo "warning: patching framework - set SENTRY_SKIP_FRAMEWORK_PATCH=true to skip this"\\n' +
          'if [ -n "$SENTRY_SKIP_FRAMEWORK_PATCH" ]; then\\n' +
          '  echo "warning: skipping framework patch"\\n' +
          '  exit 0\\n' +
          'fi\\n' +
          'APP_PATH="${TARGET_BUILD_DIR}/${WRAPPER_NAME}"\\n' +
          'find "$APP_PATH" -name \'Sentry*.framework\' -type d | while read -r FRAMEWORK\\n' +
          'do\\n' +
          'FRAMEWORK_EXECUTABLE_NAME=$(defaults read "$FRAMEWORK/Info.plist" CFBundleExecutable)\\n' +
          'FRAMEWORK_EXECUTABLE_PATH="$FRAMEWORK/$FRAMEWORK_EXECUTABLE_NAME"\\n' +
          'echo "Executable is $FRAMEWORK_EXECUTABLE_PATH"\\n' +
          'EXTRACTED_ARCHS=()\\n' +
          'for ARCH in $ARCHS\\n' +
          'do\\n' +
          'echo "Checking if $FRAMEWORK_EXECUTABLE_PATH needs to be stripped."\\n' +
          '# Do not skip if "Architectures in the fat file".\\n' +
          '# Skip if Non-fat file or if file not found. \\n' +
          'if lipo -info "$FRAMEWORK_EXECUTABLE_PATH" | grep -v " fat "; then\\n' +
          '    echo "Strip not required, skipping the strip script."\\n' +
          '    exit 0\\n' +
          'fi\\n' +
          'echo "Extracting $ARCH from $FRAMEWORK_EXECUTABLE_NAME"\\n' +
          'lipo -extract "$ARCH" "$FRAMEWORK_EXECUTABLE_PATH" -o "$FRAMEWORK_EXECUTABLE_PATH-$ARCH"\\n' +
          'EXTRACTED_ARCHS+=("$FRAMEWORK_EXECUTABLE_PATH-$ARCH")\\n' +
          'done\\n' +
          'echo "Merging extracted architectures: ${ARCHS}"\\n' +
          'lipo -o "$FRAMEWORK_EXECUTABLE_PATH-merged" -create "${EXTRACTED_ARCHS[@]}"\\n' +
          'rm "${EXTRACTED_ARCHS[@]}"\\n' +
          'echo "Replacing original executable with thinned version"\\n' +
          'rm "$FRAMEWORK_EXECUTABLE_PATH"\\n' +
          'mv "$FRAMEWORK_EXECUTABLE_PATH-merged" "$FRAMEWORK_EXECUTABLE_PATH"\\n' +
          'done',
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
