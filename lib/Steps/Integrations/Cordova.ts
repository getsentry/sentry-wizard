import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { Args } from '../../Constants';
import { exists, matchesContent, patchMatchingFile } from '../../Helper/File';
import { dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const xcode = require('xcode');

export class Cordova extends BaseIntegration {
  protected sentryCli: SentryCli;
  protected folderPrefix = 'platforms';
  protected pluginFolder = ['.'];

  constructor(protected argv: Args) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    if (this.argv.uninstall) {
      return this.uninstall(answers);
    }

    const sentryCliProperties = this.sentryCli.convertAnswersToProperties(
      answers,
    );

    await patchMatchingFile(
      `${this.folderPrefix}/ios/*.xcodeproj/project.pbxproj`,
      this.patchXcodeProj.bind(this),
    );

    await this.addSentryProperties(sentryCliProperties);
    green(`Successfully set up for cordova`);

    return {};
  }

  public async uninstall(answers: Answers): Promise<Answers> {
    await patchMatchingFile(
      '**/*.xcodeproj/project.pbxproj',
      this.unpatchXcodeProj.bind(this),
    );

    return {};
  }

  public async shouldConfigure(answers: Answers): Promise<Answers> {
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

    let result = false;
    if (!exists(path.join('sentry.properties'))) {
      result = true;
      this.debug(`sentry.properties not exists`);
    }

    if (
      !matchesContent('**/*.xcodeproj/project.pbxproj', /SENTRY_PROPERTIES/gi)
    ) {
      result = true;
      this.debug('**/*.xcodeproj/project.pbxproj not matched');
    }

    if (this.argv.uninstall) {
      // if we uninstall we need to invert the result so we remove already patched
      result = !result;
    }

    this._shouldConfigure = Promise.resolve({ cordova: result });
    return this.shouldConfigure;
  }

  private unpatchXcodeProj(
    contents: string,
    filename: string,
  ): Promise<string> {
    const proj = xcode.project(filename);
    return new Promise((resolve, reject) => {
      proj.parse((err: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.unpatchXcodeBuildScripts(proj);
        resolve(proj.writeSync());
      });
    });
  }

  private unpatchXcodeBuildScripts(proj: any): void {
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
        delete scripts[key];
        delete scripts[key + '_comment'];
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

  private patchXcodeProj(
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

        const buildScripts = [];
        for (const key in proj.hash.project.objects.PBXShellScriptBuildPhase ||
          {}) {
          if (
            proj.hash.project.objects.PBXShellScriptBuildPhase.hasOwnProperty(
              key,
            )
          ) {
            const val = proj.hash.project.objects.PBXShellScriptBuildPhase[key];
            if (val.isa) {
              buildScripts.push(val);
            }
          }
        }

        this.addNewXcodeBuildPhaseForSymbols(buildScripts, proj);
        this.addNewXcodeBuildPhaseForStripping(buildScripts, proj);

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

  private addNewXcodeBuildPhaseForSymbols(buildScripts: any, proj: any): void {
    for (const script of buildScripts) {
      if (script.shellScript.match(/SENTRY_PROPERTIES/)) {
        return;
      }
    }
    const cwd = path.join(process.cwd(), 'sentry.properties');
    proj.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript:
          'export SENTRY_PROPERTIES=' +
          cwd +
          '\\n' +
          'function getProperty {\\n' +
          '    PROP_KEY=$1\\n' +
          '    PROP_VALUE=`cat $SENTRY_PROPERTIES | grep "$PROP_KEY" | cut -d\'=\' -f2`\\n' +
          '    echo $PROP_VALUE\\n' +
          '}\\n' +
          'if [ ! -f $SENTRY_PROPERTIES ]; then\\n' +
          '  echo "warning: SENTRY: sentry.properties file not found! Skipping symbol upload."\\n' +
          '  exit 0\\n' +
          'fi\\n' +
          'echo "# Reading property from $SENTRY_PROPERTIES"\\n' +
          'SENTRY_CLI=$(getProperty "cli.executable")\\n' +
          'SENTRY_COMMAND="../../$SENTRY_CLI upload-dsym"\\n' +
          '$SENTRY_COMMAND',
      },
    );
  }

  private addNewXcodeBuildPhaseForStripping(
    buildScripts: any,
    proj: any,
  ): void {
    for (const script of buildScripts) {
      if (script.shellScript.match(/SENTRY_FRAMEWORK_PATCH/)) {
        return;
      }
    }
    // tslint:disable:no-invalid-template-strings
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
          'APP_PATH="${TARGET_BUILD_DIR}/${WRAPPER_NAME}"\\n' +
          'find "$APP_PATH" -name \'*.framework\' -type d | while read -r FRAMEWORK\\n' +
          'do\\n' +
          'FRAMEWORK_EXECUTABLE_NAME=$(defaults read "$FRAMEWORK/Info.plist" CFBundleExecutable)\\n' +
          'FRAMEWORK_EXECUTABLE_PATH="$FRAMEWORK/$FRAMEWORK_EXECUTABLE_NAME"\\n' +
          'echo "Executable is $FRAMEWORK_EXECUTABLE_PATH"\\n' +
          'EXTRACTED_ARCHS=()\\n' +
          'for ARCH in $ARCHS\\n' +
          'do\\n' +
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
    // tslint:enable:no-invalid-template-strings
  }

  private addSentryProperties(properties: any): Promise<void> {
    let rv = Promise.resolve();
    const fn = path.join('sentry.properties');
    if (exists(fn)) {
      return rv;
    }
    rv = rv.then(() =>
      fs.writeFileSync(fn, this.sentryCli.dumpProperties(properties)),
    );

    return rv;
  }
}
