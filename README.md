<p align="center">
    <a href="https://sentry.io" target="_blank" align="center">
        <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    </a>
<br/>
    <h1>Sentry Wizard</h1>
    <h4>Helping you to set up your project with Sentry</h4>
</p>

[![npm version](https://img.shields.io/npm/v/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![npm dm](https://img.shields.io/npm/dm/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![npm dt](https://img.shields.io/npm/dt/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![Discord Chat](https://img.shields.io/discord/621778831602221064.svg)](https://discord.gg/Ww9hbqr)  

[![deps](https://david-dm.org/getsentry/sentry-wizard/status.svg)](https://david-dm.org/getsentry/sentry-wizard?view=list)
[![deps dev](https://david-dm.org/getsentry/sentry-wizard/dev-status.svg)](https://david-dm.org/getsentry/sentry-wizard?type=dev&view=list)
[![deps peer](https://david-dm.org/getsentry/sentry-wizard/peer-status.svg)](https://david-dm.org/getsentry/sentry-wizard?type=peer&view=list)


![Wizard in action](https://github.com/getsentry/sentry-wizard/raw/master/assets/wizard.mov.gif)


# Usage

There are multiple ways to run the Wizard.

1. Install globally and run it anywhere:

```bash
npm install -g @sentry/wizard
# or
yarn global add @sentry/wizard

sentry-wizard
```

2. Install and run it in your project with `yarn`:

```bash
yarn add @sentry/wizard
yarn sentry-wizard
```

3. Run it directly without installing:

```bash
npx @sentry/wizard
```

# Options
```
Options:
  --help             Show help                                         [boolean]
  --version          Show version number                               [boolean]
  --debug            Enable verbose logging
                     env: SENTRY_WIZARD_DEBUG                          [boolean]
  --uninstall        Revert project set up process
                     env: SENTRY_WIZARD_UNINSTALL                      [boolean]
  --skip-connect     Skips the connection to the server
                     env: SENTRY_WIZARD_SKIP_CONNECT                   [boolean]
  --quiet            Do not fallback to prompting user asking questions
                     env: SENTRY_WIZARD_QUIET                          [boolean]
  -i, --integration  Choose the integration to set up
                     env: SENTRY_WIZARD_INTEGRATION
                       [choices: "reactNative", "cordova", "electron", "nextjs"]
  -p, --platform     Choose platform(s)
                     env: SENTRY_WIZARD_PLATFORM
                                             [array] [choices: "ios", "android"]
  -u, --url          The url to your Sentry installation
                     env: SENTRY_WIZARD_URL      [default: "https://sentry.io/"]
```

## Resources

* [![Forum](https://img.shields.io/badge/forum-sentry-green.svg)](https://forum.sentry.io/c/sdks)
* [![Discord](https://img.shields.io/discord/621778831602221064)](https://discord.gg/Ww9hbqr)
* [![Stack Overflow](https://img.shields.io/badge/stack%20overflow-sentry-green.svg)](http://stackoverflow.com/questions/tagged/sentry)
* [![Twitter Follow](https://img.shields.io/twitter/follow/getsentry?label=getsentry&style=social)](https://twitter.com/intent/follow?screen_name=getsentry)
