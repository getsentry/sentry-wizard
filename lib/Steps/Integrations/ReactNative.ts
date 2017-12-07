import * as fs from 'fs';
import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { IArgs, Platform } from '../../Constants';
import { exists, matchesContent, patchMatchingFile } from '../../Helper/File';
import { dim, green, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { MobileProject } from './MobileProject';

const xcode = require('xcode');

const OBJC_HEADER =
  '\
#if __has_include(<React/RNSentry.h>)\n\
#import <React/RNSentry.h> // This is used for versions of react >= 0.40\n\
#else\n\
#import "RNSentry.h" // This is used for versions of react < 0.40\n\
#endif';

export class ReactNative extends MobileProject {
  protected answers: Answers;
  protected sentryCli: SentryCli;

  constructor(protected argv: IArgs) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers) {
    if (this.argv.uninstall) {
      return this.uninstall(answers);
    }
    if (!await this.shouldEmit(answers)) {
      return {};
    }

    const sentryCliProperties = this.sentryCli.convertAnswersToProperties(answers);

    return new Promise(async (resolve, reject) => {
      const promises = this.getPlatforms(answers).map(async (platform: string) => {
        try {
          if (platform === 'ios') {
            await patchMatchingFile(
              'ios/*.xcodeproj/project.pbxproj',
              this.patchXcodeProj.bind(this)
            );
            await patchMatchingFile('**/AppDelegate.m', this.patchAppDelegate.bind(this));
          } else {
            await patchMatchingFile(
              '**/app/build.gradle',
              this.patchBuildGradle.bind(this)
            );
          }
          await patchMatchingFile(`index.${platform}.js`, this.patchIndexJs.bind(this));
          // rm 0.49 introduced an App.js for both platforms
          await patchMatchingFile('App.js', this.patchAppJs.bind(this), answers);
          await this.addSentryProperties(platform, sentryCliProperties);
          green(`Successfully set up ${platform} for react-native`);
        } catch (e) {
          red(e);
        }
      });
      Promise.all(promises)
        .then(resolve)
        .catch(reject);
    });
  }

  public async uninstall(answers: Answers) {
    await patchMatchingFile(
      '**/*.xcodeproj/project.pbxproj',
      this.unpatchXcodeProj.bind(this)
    );
    await patchMatchingFile('**/AppDelegate.m', this.unpatchAppDelegate.bind(this));
    await patchMatchingFile('**/app/build.gradle', this.unpatchBuildGradle.bind(this));
    return {};
  }

  protected async shouldConfigurePlatform(platform: string) {
    // if a sentry.properties file exists for the platform we want to configure
    // without asking the user.  This means that re-linking later will not
    // bring up a useless dialog.
    let result = false;
    if (!exists(`${platform}/sentry.properties`)) {
      result = true;
      this.debug(`${platform}/sentry.properties not exists`);
    }

    if (!matchesContent('**/*.xcodeproj/project.pbxproj', /sentry-cli/gi)) {
      result = true;
      this.debug('**/*.xcodeproj/project.pbxproj not matched');
    }
    if (!matchesContent('**/AppDelegate.m', /RNSentry/gi)) {
      result = true;
      this.debug('**/AppDelegate.m not matched');
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

    if (this.argv.uninstall) {
      // if we uninstall we need to invert the result so we remove already patched
      // but leave untouched platforms as they are
      return !result;
    }

    return result;
  }

  private addSentryProperties(platform: string, properties: any) {
    let rv = Promise.resolve();

    // This will create the ios/android folder before trying to write
    // sentry.properties in it which would fail otherwise
    if (!fs.existsSync(platform)) {
      dim(`${platform} folder did not exist, creating it.`);
      fs.mkdirSync(platform);
    }
    const fn = path.join(platform, 'sentry.properties');

    rv = rv.then(() => fs.writeFileSync(fn, this.sentryCli.dumpProperties(properties)));

    return rv;
  }

  private patchAppJs(contents: string, filename: string, answers: Answers) {
    // since the init call could live in other places too, we really only
    // want to do this if we managed to patch any of the other files as well.
    if (contents.match(/Sentry.config\(/)) {
      return Promise.resolve(null);
    }

    // if we match react-native-sentry somewhere, we already patched the file
    // and no longer need to
    if (contents.match('react-native-sentry')) {
      return Promise.resolve(contents);
    }

    const config: any = {};
    this.getPlatforms(answers).forEach((platform: string) => {
      config[platform] = _.get(answers, 'config.dsn.secret', null);
    });

    return Promise.resolve(
      contents.replace(
        /^([^]*)(import\s+[^;]*?;$)/m,
        match =>
          match +
          "\n\nimport { Sentry } from 'react-native-sentry';\n\n" +
          `const sentryDsn = Platform.select(${JSON.stringify(config)});\n` +
          'Sentry.config(sentryDsn).install();\n'
      )
    );
  }

  private patchIndexJs(contents: string, filename: string) {
    // since the init call could live in other places too, we really only
    // want to do this if we managed to patch any of the other files as well.
    if (contents.match(/Sentry.config\(/)) {
      return Promise.resolve(null);
    }

    // if we match react-native-sentry somewhere, we already patched the file
    // and no longer need to
    if (contents.match('react-native-sentry')) {
      return Promise.resolve(contents);
    }

    return Promise.resolve(
      contents.replace(/^([^]*)(import\s+[^;]*?;$)/m, match => {
        return (
          match +
          "\n\nimport { Sentry } from 'react-native-sentry';\n\n" +
          'Sentry.config(' +
          JSON.stringify(_.get(this.answers, 'config.dsn.secret', '__DSN__')) +
          ').install();\n'
        );
      })
    );
  }

  // ANDROID -----------------------------------------

  private patchBuildGradle(contents: string) {
    const applyFrom =
      'apply from: "../../node_modules/react-native-sentry/sentry.gradle"';
    if (contents.indexOf(applyFrom) >= 0) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      contents.replace(
        /^apply from: "..\/..\/node_modules\/react-native\/react.gradle"/m,
        match => match + '\n' + applyFrom
      )
    );
  }

  private unpatchBuildGradle(contents: string) {
    return Promise.resolve(
      contents.replace(
        /^\s*apply from: ["']..\/..\/node_modules\/react-native-sentry\/sentry.gradle["'];?\s*?\r?\n/m,
        ''
      )
    );
  }

  // IOS -----------------------------------------

  private patchExistingXcodeBuildScripts(buildScripts: any) {
    for (const script of buildScripts) {
      if (
        !script.shellScript.match(/(packager|scripts)\/react-native-xcode\.sh\b/) ||
        script.shellScript.match(/sentry-cli\s+react-native[\s-]xcode/)
      ) {
        continue;
      }
      let code = JSON.parse(script.shellScript);
      code =
        'export SENTRY_PROPERTIES=sentry.properties\n' +
        code.replace(
          /^.*?\/(packager|scripts)\/react-native-xcode\.sh\s*/m,
          (match: any) =>
            `../node_modules/@sentry/cli/bin/sentry-cli react-native xcode ${match}`
        );
      script.shellScript = JSON.stringify(code);
    }
  }

  private addNewXcodeBuildPhaseForSymbols(buildScripts: any, proj: any) {
    for (const script of buildScripts) {
      if (script.shellScript.match(/sentry-cli\s+upload-dsym/)) {
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
        shellScript:
          'export SENTRY_PROPERTIES=sentry.properties\\n' +
          '../node_modules/@sentry/cli/bin/sentry-cli upload-dsym',
      }
    );
  }

  private addZLibToXcode(proj: any) {
    proj.addPbxGroup([], 'Frameworks', 'Application');
    proj.addFramework('libz.tbd', {
      link: true,
      target: proj.getFirstTarget().uuid,
    });
  }

  private patchAppDelegate(contents: string) {
    // add the header if it's not there yet.
    if (!contents.match(/#import "RNSentry.h"/)) {
      contents = contents.replace(
        /(#import <React\/RCTRootView.h>)/,
        '$1\n' + OBJC_HEADER
      );
    }

    // add root view init.
    const rootViewMatch = contents.match(/RCTRootView\s*\*\s*([^\s=]+)\s*=\s*\[/);
    if (rootViewMatch) {
      const rootViewInit = '[RNSentry installWithRootView:' + rootViewMatch[1] + '];';
      if (contents.indexOf(rootViewInit) < 0) {
        contents = contents.replace(
          /^(\s*)RCTRootView\s*\*\s*[^\s=]+\s*=\s*\[([^]*?\s*\]\s*;\s*$)/m,
          (match, indent) => match.trim() + '\n' + indent + rootViewInit + '\n'
        );
      }
    }

    return Promise.resolve(contents);
  }

  private patchXcodeProj(contents: string, filename: string) {
    const proj = xcode.project(filename);
    return new Promise((resolve, reject) => {
      proj.parse((err: any) => {
        if (err) {
          reject(err);
          return;
        }

        const buildScripts = [];
        for (const key in proj.hash.project.objects.PBXShellScriptBuildPhase || {}) {
          if (proj.hash.project.objects.PBXShellScriptBuildPhase.hasOwnProperty(key)) {
            const val = proj.hash.project.objects.PBXShellScriptBuildPhase[key];
            if (val.isa) {
              buildScripts.push(val);
            }
          }
        }

        this.patchExistingXcodeBuildScripts(buildScripts);
        this.addNewXcodeBuildPhaseForSymbols(buildScripts, proj);
        this.addZLibToXcode(proj);

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

  private unpatchAppDelegate(contents: string) {
    return Promise.resolve(
      contents
        .replace(/^#if __has_include\(<React\/RNSentry.h>\)[^]*?\#endif\r?\n/m, '')
        .replace(/^#import\s+(?:<React\/RNSentry.h>|"RNSentry.h")\s*?\r?\n/m, '')
        .replace(/(\r?\n|^)\s*\[RNSentry\s+installWithRootView:.*?\];\s*?\r?\n/m, '')
    );
  }

  private unpatchXcodeBuildScripts(proj: any) {
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
      if (!script.shellScript.match(/sentry-cli\s+react-native[\s-]xcode\b/)) {
        continue;
      }

      script.shellScript = JSON.stringify(
        JSON.parse(script.shellScript)
          // "legacy" location for this.  This is what happens if users followed
          // the old documentation for where to add the bundle command
          .replace(
            /^..\/node_modules\/react-native-sentry\/bin\/bundle-frameworks\s*?\r\n?/m,
            ''
          )
          // legacy location for dsym upload
          .replace(
            /^..\/node_modules\/@sentry\/cli\/bin\/sentry-cli upload-dsym\s*?\r?\n/m,
            ''
          )
          // remove sentry properties export
          .replace(/^export SENTRY_PROPERTIES=sentry.properties\r?\n/m, '')
          // unwrap react-native-xcode.sh command.  In case someone replaced it
          // entirely with the sentry-cli command we need to put the original
          // version back in.
          .replace(
            /^(?:..\/node_modules\/@sentry\/cli\/bin\/)?sentry-cli\s+react-native[\s-]xcode(\s+.*?)$/m,
            (match: any, m1: string) => {
              const rv = m1.trim();
              if (rv === '') {
                return '../node_modules/react-native/packager/react-native-xcode.sh';
              } else {
                return rv;
              }
            }
          )
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
        script.shellScript.match(/react-native-sentry\/bin\/bundle-frameworks\b/) ||
        script.shellScript.match(/@sentry\/cli\/bin\/sentry-cli\s+upload-dsym\b/)
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

  private unpatchXcodeProj(contents: string, filename: string) {
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
}
