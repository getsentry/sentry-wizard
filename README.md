<p align="center">
    <a href="https://sentry.io" target="_blank" align="center">
        <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    </a>
<br/>
    <h1>Sentry Wizard</h1>
    <h4>Helping you to setup your project with Sentry</h4>
</p>

[![Travis](https://img.shields.io/travis/getsentry/sentry-wizard.svg?maxAge=2592000)](https://travis-ci.org/getsentry/sentry-wizard)
[![npm version](https://img.shields.io/npm/v/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![npm dm](https://img.shields.io/npm/dm/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![npm dt](https://img.shields.io/npm/dt/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)

[![deps](https://david-dm.org/getsentry/sentry-wizard/status.svg)](https://david-dm.org/getsentry/sentry-wizard?view=list)
[![deps dev](https://david-dm.org/getsentry/sentry-wizard/dev-status.svg)](https://david-dm.org/getsentry/sentry-wizard?type=dev&view=list)
[![deps peer](https://david-dm.org/getsentry/sentry-wizard/peer-status.svg)](https://david-dm.org/getsentry/sentry-wizard?type=peer&view=list)


![Wizard in action](https://github.com/getsentry/sentry-wizard/raw/master/assets/wizard.mov.gif)


# Usage

Install it with `npm` or `yarn`

```
npm install @sentry/wizard
```

Call `sentry-wizard` in your project and follow the instructions.

# Options
```
Options:
  --help          Show help                                            [boolean]
  --version       Show version number                                  [boolean]
  --debug         Enable verbose logging
                  env: SENTRY_WIZARD_DEBUG                             [boolean]
  --uninstall     Revert project setup process
                  env: SENTRY_WIZARD_UNINSTALL                         [boolean]
  --skip-connect  Skips the connection to the server
                  env: SENTRY_WIZARD_SKIP_CONNECT                      [boolean]
  -t, --type      Choose a project type
                  env: SENTRY_WIZARD_TYPE
                       [choices: "reactNative", "javascript", "node", "cordova"]
  -p, --platform  Choose platform(s)
                  env: SENTRY_WIZARD_PLATFORM[array] [choices: "ios", "android"]
  -u, --url       The url to your Sentry installation
                  env: SENTRY_WIZARD_URL         [default: "https://sentry.io/"]
```