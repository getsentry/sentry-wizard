import { prompt, Question, Answers } from 'inquirer';
import { BaseStep } from '../Step';
import { dim, green, red } from '../../Helper';
import { SentryCliHelper } from './SentryCliHelper';
import { patchMatchingFile } from './FileHelper';
import * as _ from 'lodash';

const xcode = require('xcode');
const fs = require('fs');

const OBJC_HEADER =
  '\
#if __has_include(<React/RNSentry.h>)\n\
#import <React/RNSentry.h> // This is used for versions of react >= 0.40\n\
#else\n\
#import "RNSentry.h" // This is used for versions of react < 0.40\n\
#endif';

export class ReactNative extends BaseStep {
  protected answers: Answers;
  protected platforms: string[];
  protected sentryCliHelper: SentryCliHelper;

  constructor(protected argv: any = {}) {
    super(argv);
    this.sentryCliHelper = new SentryCliHelper(this.argv);
  }

  async emit(answers: Answers) {
    let sentryCliProperties = this.sentryCliHelper.convertSelectedProjectToProperties(
      answers
    );

    return new Promise(async (resolve, reject) => {
      this.answers = answers;
      this.platforms = (await this.platformSelector()).platform;
      let promises = this.platforms.map((platform: string) =>
        this.shouldConfigurePlatform(platform)
          .then(async () => {
            try {
              if (platform == 'ios') {
                await patchMatchingFile(
                  'ios/*.xcodeproj/project.pbxproj',
                  this.patchXcodeProj.bind(this)
                );
                await patchMatchingFile(
                  '**/AppDelegate.m',
                  this.patchAppDelegate.bind(this)
                );
              } else {
                await patchMatchingFile(
                  '**/app/build.gradle',
                  this.patchBuildGradle.bind(this)
                );
              }
              await patchMatchingFile(
                `index.${platform}.js`,
                this.patchIndexJs.bind(this)
              );
              // rm 0.49 introduced an App.js for both platforms
              await patchMatchingFile('App.js', this.patchAppJs.bind(this));
              await this.addSentryProperties(platform, sentryCliProperties);
              green(`Successfully setup ${platform}`);
            } catch (e) {
              red(e);
            }
          })
          .catch((reason: any) => {
            dim(reason);
          })
      );
      Promise.all(promises)
        .then(resolve)
        .catch(reject);
    });
  }

  shouldConfigurePlatform(platform: string) {
    // if a sentry.properties file exists for the platform we want to configure
    // without asking the user.  This means that re-linking later will not
    // bring up a useless dialog.
    if (
      fs.existsSync(platform + '/sentry.properties') ||
      fs.existsSync(process.cwd() + platform + '/sentry.properties')
    ) {
      return Promise.reject(
        `${platform}/sentry.properties already exists, skipping setup for platform ${platform}`
      );
    }
    return Promise.resolve();
  }

  addSentryProperties(platform: string, properties: any) {
    let rv = Promise.resolve();

    // This will create the ios/android folder before trying to write
    // sentry.properties in it which would fail otherwise
    if (!fs.existsSync(platform)) {
      fs.mkdirSync(platform);
    }
    let fn = platform + '/sentry.properties';

    rv = rv.then(() =>
      fs.writeFileSync(fn, this.sentryCliHelper.dumpProperties(properties))
    );

    return rv;
  }

  patchAppDelegate(contents: string) {
    // add the header if it's not there yet.
    if (!contents.match(/#import "RNSentry.h"/)) {
      contents = contents.replace(
        /(#import <React\/RCTRootView.h>)/,
        '$1\n' + OBJC_HEADER
      );
    }

    // add root view init.
    let rootViewMatch = contents.match(/RCTRootView\s*\*\s*([^\s=]+)\s*=\s*\[/);
    if (rootViewMatch) {
      let rootViewInit = '[RNSentry installWithRootView:' + rootViewMatch[1] + '];';
      if (contents.indexOf(rootViewInit) < 0) {
        contents = contents.replace(
          /^(\s*)RCTRootView\s*\*\s*[^\s=]+\s*=\s*\[([^]*?\s*\]\s*;\s*$)/m,
          (match, indent) => match.trim() + '\n' + indent + rootViewInit + '\n'
        );
      }
    }

    return Promise.resolve(contents);
  }

  patchAppJs(contents: string, filename: string) {
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

    let config: any = {};
    this.platforms.forEach((platform: string) => {
      config[platform] = _.get(this.answers, 'selectedProject.keys.0.dsn.secret', null);
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

  patchIndexJs(contents: string, filename: string) {
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
          JSON.stringify(
            _.get(this.answers, 'selectedProject.keys.0.dsn.secrect', '__DSN__')
          ) +
          ').install();\n'
        );
      })
    );
  }

  patchBuildGradle(contents: string) {
    let applyFrom = 'apply from: "../../node_modules/react-native-sentry/sentry.gradle"';
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

  patchExistingXcodeBuildScripts(buildScripts: any) {
    for (let script of buildScripts) {
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
            `../node_modules/sentry-cli-binary/bin/sentry-cli react-native xcode ${match}`
        );
      script.shellScript = JSON.stringify(code);
    }
  }

  addNewXcodeBuildPhaseForSymbols(buildScripts: any, proj: any) {
    for (let script of buildScripts) {
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
          '../node_modules/sentry-cli-binary/bin/sentry-cli upload-dsym'
      }
    );
  }

  addZLibToXcode(proj: any) {
    proj.addPbxGroup([], 'Frameworks', 'Application');
    proj.addFramework('libz.tbd', {
      link: true,
      target: proj.getFirstTarget().uuid
    });
  }

  patchXcodeProj(contents: string, filename: string) {
    let proj = xcode.project(filename);
    return new Promise((resolve, reject) => {
      proj.parse((err: any) => {
        if (err) {
          reject(err);
          return;
        }

        let buildScripts = [];
        for (let key in proj.hash.project.objects.PBXShellScriptBuildPhase || {}) {
          let val = proj.hash.project.objects.PBXShellScriptBuildPhase[key];
          if (val.isa) {
            buildScripts.push(val);
          }
        }

        this.patchExistingXcodeBuildScripts(buildScripts);
        this.addNewXcodeBuildPhaseForSymbols(buildScripts, proj);
        this.addZLibToXcode(proj);

        // we always modify the xcode file in memory but we only want to save it
        // in case the user wants configuration for ios.  This is why we check
        // here first if changes are made before we might prompt the platform
        // continue prompt.
        let newContents = proj.writeSync();
        if (newContents === contents) {
          resolve();
        } else {
          resolve(newContents);
        }
      });
    });
  }

  platformSelector() {
    return prompt([
      {
        type: 'checkbox',
        name: 'platform',
        message: 'Select the platforms you like to setup:',
        choices: [
          {
            name: 'iOS',
            value: 'ios',
            checked: true
          },
          {
            name: 'Android',
            value: 'android',
            checked: true
          }
        ]
      }
    ]);
  }
}
