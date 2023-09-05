/* eslint-disable max-lines */
import { exec } from 'child_process';
import * as fs from 'fs';
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { promisify } from 'util';

import type { Args } from '../../Constants';
import {
  exists,
  matchesContent,
  matchFiles,
  patchMatchingFile,
} from '../../Helper/File';
import { dim, green, l, nl, red } from '../../Helper/Logging';
import { checkPackageVersion } from '../../Helper/Package';
import {
  detectPackageManger,
  installPackageWithPackageManager,
} from '../../../src/utils/package-manager';
import { SentryCli } from '../../Helper/SentryCli';
import { MobileProject } from './MobileProject';
import { BottomBar } from '../../Helper/BottomBar';
import { URL } from 'url';

const xcode = require('xcode');

export const COMPATIBLE_REACT_NATIVE_VERSIONS = '>=0.69.0';
export const COMPATIBLE_SDK_VERSION = '>= 5.0.0';

export const SENTRY_REACT_NATIVE_PACKAGE = '@sentry/react-native';
export const REACT_NATIVE_PACKAGE = 'react-native';

export const DOCS_MANUAL_STEPS =
  'https://docs.sentry.io/platforms/react-native/manual-setup/manual-setup/';

export class ReactNative extends MobileProject {
  /**
   * All React Native versions have app/build.gradle with android section.
   */
  private static _buildGradleAndroidSectionBeginning = /^android {/m;

  private url: string | undefined;

  protected _answers: Answers;
  protected _sentryCli: SentryCli;

  public constructor(protected _argv: Args) {
    super(_argv);
    this.url = _argv.url;
    this._sentryCli = new SentryCli(this._argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    if (this._argv.uninstall) {
      return this.uninstall(answers);
    }
    if (!(await this.shouldEmit(answers))) {
      return {};
    }
    nl();

    let userAnswers: Answers = { continue: true };
    const packageManager = detectPackageManger();

    const hasCompatibleReactNativeVersion = checkPackageVersion(
      this._readAppPackage(),
      REACT_NATIVE_PACKAGE,
      COMPATIBLE_REACT_NATIVE_VERSIONS,
      true,
    );
    if (!hasCompatibleReactNativeVersion && !this._argv.quiet) {
      userAnswers = await prompt({
        message:
          "Your version of React Native is not compatible with Sentry's React Native SDK. Do you want to continue?",
        name: 'continue',
        default: false,
        type: 'confirm',
      });
      nl();
    }
    if (!userAnswers.continue) {
      throw new Error(
        `Please upgrade to a version that is compatible with ${COMPATIBLE_REACT_NATIVE_VERSIONS}. Or use ${DOCS_MANUAL_STEPS}`,
      );
    }

    if (packageManager) {
      BottomBar.show(`Adding ${SENTRY_REACT_NATIVE_PACKAGE}...`);
      await installPackageWithPackageManager(
        packageManager,
        SENTRY_REACT_NATIVE_PACKAGE,
      );
      BottomBar.hide();
      green(`✓ Added \`${SENTRY_REACT_NATIVE_PACKAGE}\``);
    }
    const hasCompatibleSentryReactNativeVersion = checkPackageVersion(
      this._readAppPackage(),
      SENTRY_REACT_NATIVE_PACKAGE,
      COMPATIBLE_SDK_VERSION,
      true,
    );
    if (!hasCompatibleSentryReactNativeVersion && !this._argv.quiet) {
      userAnswers = await prompt({
        message: `Your version of ${SENTRY_REACT_NATIVE_PACKAGE} is not compatible with this wizard. Do you want to continue?`,
        name: 'continue',
        default: false,
        type: 'confirm',
      });
      nl();
    }
    if (!userAnswers.continue) {
      throw new Error(
        `Please upgrade to a version that is compatible with ${COMPATIBLE_SDK_VERSION}.`,
      );
    }

    const sentryCliProperties =
      this._sentryCli.convertAnswersToProperties(answers);

    const promises = this.getPlatforms(answers).map(
      async (platform: string) => {
        try {
          if (platform === 'ios') {
            await patchMatchingFile(
              'ios/*.xcodeproj/project.pbxproj',
              this._patchXcodeProj.bind(this),
            );
            green('✓ Patched build script in Xcode project.');
            BottomBar.show('Adding Sentry pods...');
            await this._podInstall();
            BottomBar.hide();
            green('✓ Pods installed.');
          } else {
            await patchMatchingFile(
              '**/app/build.gradle',
              this._patchBuildGradle.bind(this),
            );
            green('✓ Patched build.gradle file.');
          }
          await this._patchJsSentryInit(platform, answers);
          await this._addSentryProperties(platform, sentryCliProperties);
          green(`✓ Added sentry.properties file to ${platform}`);
        } catch (e) {
          red(e);
        }
      },
    );

    await Promise.all(promises);

    let host: string | null = null;
    try {
      host = new URL(this.url || '').host;
    } catch (_error) {
      // ignore
    }
    const orgSlug = _.get(answers, 'config.organization.slug', null);
    const projectId = _.get(answers, 'config.project.id', null);
    const projectIssuesUrl =
      host && orgSlug && projectId
        ? `https://${orgSlug}.${host}/issues/?project=${projectId}`
        : null;

    l(`
To make sure everything is set up correctly, put the following code snippet into your application.
The snippet will create a button that, when tapped, sends a test event to Sentry.
`);

    if (projectIssuesUrl) {
      l(`After that check your project issues:`);
      l(projectIssuesUrl);
      nl();
    }

    l(
      `<Button title='Try!' onPress={ () => { Sentry.captureException(new Error('First error')) }}/>`,
    );
    nl();

    if (!this._argv.quiet) {
      await prompt({
        message: 'Have you successfully sent a test event?',
        name: 'snippet',
        default: true,
        type: 'confirm',
      });
    }

    return answers;
  }

  public async uninstall(_answers: Answers): Promise<Answers> {
    await patchMatchingFile(
      '**/*.xcodeproj/project.pbxproj',
      this._unpatchXcodeProj.bind(this),
    );
    await patchMatchingFile(
      '**/app/build.gradle',
      this._unpatchBuildGradle.bind(this),
    );
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async _shouldConfigurePlatform(platform: string): Promise<boolean> {
    let result = false;

    if (!exists(`${platform}/sentry.properties`)) {
      result = true;
      this.debug(`${platform}/sentry.properties not exists`);
    }

    if (!matchesContent('**/*.xcodeproj/project.pbxproj', /sentry-cli/gi)) {
      result = true;
      this.debug('**/*.xcodeproj/project.pbxproj not matched');
    }

    if (!matchesContent('**/app/build.gradle', /sentry\.gradle/gi)) {
      result = true;
      this.debug('**/app/build.gradle not matched');
    }

    const regex = /Sentry/gi;
    if (
      exists(`index.${platform}.js`) &&
      !matchesContent(`index.${platform}.js`, regex)
    ) {
      result = true;
      this.debug(`index.${platform}.js not matched`);
    }
    if (exists('App.js') && !matchesContent('App.js', regex)) {
      result = true;
      this.debug('index.js or App.js not matched');
    }

    if (this._argv.uninstall) {
      // if we uninstall we need to invert the result so we remove already patched
      // but leave untouched platforms as they are
      return !result;
    }

    return result;
  }

  private _readAppPackage(): Record<string, unknown> {
    let appPackage: Record<string, unknown> = {};

    try {
      appPackage = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
      );
    } catch {
      // We don't need to have this
    }

    return appPackage;
  }

  private async _podInstall(): Promise<void> {
    await promisify(exec)('npx --yes pod-install --non-interactive --quiet');
  }

  private async _patchJsSentryInit(
    platform: string,
    answers: Answers,
  ): Promise<void> {
    const prefixGlob = '{.,./src}';
    const suffixGlob = '@(j|t|cj|mj)s?(x)';
    const platformGlob = `index.${platform}.${suffixGlob}`;
    // rm 0.49 introduced an App.js for both platforms
    const universalGlob = `App.${suffixGlob}`;
    const jsFileGlob = `${prefixGlob}/+(${platformGlob}|${universalGlob})`;

    const jsFileToPatch = matchFiles(jsFileGlob);
    if (jsFileToPatch.length !== 0) {
      await patchMatchingFile(
        jsFileGlob,
        this._patchJs.bind(this),
        answers,
        platform,
      );
      green(`✓ Patched ${jsFileToPatch.join(', ')} file(s).`);
    } else {
      red(`✗ Could not find ${platformGlob} nor ${universalGlob} files.`);
      red('✗ Please, visit https://docs.sentry.io/platforms/react-native');
    }
  }

  private _addSentryProperties(
    platform: string,
    properties: any,
  ): Promise<void> {
    let rv = Promise.resolve();

    // This will create the ios/android folder before trying to write
    // sentry.properties in it which would fail otherwise
    if (!fs.existsSync(platform)) {
      dim(`${platform} folder did not exist, creating it.`);
      fs.mkdirSync(platform);
    }
    const fn = path.join(platform, 'sentry.properties');

    if (platform === 'android' && properties['cli/executable']) {
      // We don't need to write the sentry-cli path in the properties file
      // since our gradle plugins already pick it up on the correct spot
      delete properties['cli/executable'];
    }
    rv = rv.then(() =>
      fs.writeFileSync(fn, this._sentryCli.dumpProperties(properties)),
    );

    return rv;
  }

  private _patchJs(
    contents: string,
    _filename: string,
    answers: Answers,
    platform?: string,
  ): Promise<string | null> {
    // since the init call could live in other places too, we really only
    // want to do this if we managed to patch any of the other files as well.
    if (contents.match(/Sentry.config\(/)) {
      return Promise.resolve(null);
    }

    // if we match @sentry\/react-native somewhere, we already patched the file
    // and no longer need to
    if (contents.match('@sentry/react-native')) {
      return Promise.resolve(contents);
    }

    let dsn = '__DSN__';
    this.getPlatforms(answers).forEach((selectedPlatform: string) => {
      if (platform && selectedPlatform === platform) {
        dsn = _.get(answers, 'config.dsn.public', null);
      } else if (platform === undefined) {
        dsn = _.get(answers, 'config.dsn.public', null);
      }
    });

    return Promise.resolve(
      contents.replace(
        /^([^]*)(import\s+[^;]*?;$)/m,
        (match) =>
          // eslint-disable-next-line prefer-template
          match +
          "\n\nimport * as Sentry from '@sentry/react-native';\n\n" +
          'Sentry.init({ \n' +
          `  dsn: '${dsn}', \n` +
          '});\n',
      ),
    );
  }

  // ANDROID -----------------------------------------

  private _patchBuildGradle(contents: string): Promise<string | null> {
    const applyFrom =
      'apply from: "../../node_modules/@sentry/react-native/sentry.gradle"';
    if (contents.indexOf(applyFrom) >= 0) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      contents.replace(
        ReactNative._buildGradleAndroidSectionBeginning,
        // eslint-disable-next-line prefer-template
        (match) => applyFrom + '\n' + match,
      ),
    );
  }

  private _unpatchBuildGradle(contents: string): Promise<string> {
    return Promise.resolve(
      contents.replace(
        /^\s*apply from: ["']..\/..\/node_modules\/@sentry\/react-native\/sentry.gradle["'];?\s*?\r?\n/m,
        '',
      ),
    );
  }

  // IOS -----------------------------------------

  private _patchExistingXcodeBuildScripts(buildScripts: any): void {
    for (const script of buildScripts) {
      if (
        !script.shellScript.match(/\/scripts\/react-native-xcode\.sh/i) ||
        script.shellScript.match(/sentry-cli\s+react-native\s+xcode/i)
      ) {
        continue;
      }
      let code = JSON.parse(script.shellScript);
      code =
        // eslint-disable-next-line prefer-template, @typescript-eslint/restrict-plus-operands
        'export SENTRY_PROPERTIES=sentry.properties\n' +
        'export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"\n' +
        code.replace(
          '$REACT_NATIVE_XCODE',
          () =>
            // eslint-disable-next-line no-useless-escape
            '\\"../node_modules/@sentry/cli/bin/sentry-cli react-native xcode $REACT_NATIVE_XCODE\\"',
        ) +
        '\n/bin/sh -c "$WITH_ENVIRONMENT ../node_modules/@sentry/react-native/scripts/collect-modules.sh"\n';
      script.shellScript = JSON.stringify(code);
    }
  }

  private _addNewXcodeBuildPhaseForSymbols(buildScripts: any, proj: any): void {
    for (const script of buildScripts) {
      if (
        script.shellScript.match(
          /sentry-cli\s+(upload-dsym|debug-files upload)/,
        )
      ) {
        return;
      }
    }

    proj.addBuildPhase(
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
  }

  private _patchXcodeProj(
    contents: string,
    filename: string,
  ): Promise<string | undefined> {
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
            // eslint-disable-next-line no-prototype-builtins
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

        try {
          this._patchExistingXcodeBuildScripts(buildScripts);
        } catch (e) {
          red(e);
        }
        try {
          this._addNewXcodeBuildPhaseForSymbols(buildScripts, proj);
        } catch (e) {
          red(e);
        }

        // we always modify the xcode file in memory but we only want to save it
        // in case the user wants configuration for ios.  This is why we check
        // here first if changes are made before we might prompt the platform
        // continue prompt.
        const newContents = proj.writeSync();
        if (newContents === contents) {
          resolve(undefined);
        } else {
          resolve(newContents);
        }
      });
    });
  }

  private _unpatchXcodeBuildScripts(proj: any): void {
    const scripts = proj.hash.project.objects.PBXShellScriptBuildPhase || {};
    const firstTarget = proj.getFirstTarget().uuid;
    const nativeTargets = proj.hash.project.objects.PBXNativeTarget;

    // scripts to patch partially.  Run this first so that we don't
    // accidentally delete some scripts later entirely that we only want to
    // rewrite.
    for (const key of Object.keys(scripts)) {
      const script = scripts[key];

      // ignore comments
      if (typeof script === 'string') {
        continue;
      }

      // ignore scripts that do not invoke the react-native-xcode command.
      if (!script.shellScript.match(/sentry-cli\s+react-native\s+xcode/i)) {
        continue;
      }

      script.shellScript = JSON.stringify(
        JSON.parse(script.shellScript)
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
          ),
      );
    }

    // scripts to kill entirely.
    for (const key of Object.keys(scripts)) {
      const script = scripts[key];

      // ignore comments and keys that got deleted
      if (typeof script === 'string' || script === undefined) {
        continue;
      }

      if (
        script.shellScript.match(
          /@sentry\/cli\/bin\/sentry-cli\s+(upload-dsym|debug-files upload)\b/,
        )
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

  private _unpatchXcodeProj(
    _contents: string,
    filename: string,
  ): Promise<string> {
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
}
