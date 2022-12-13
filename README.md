<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <picture>
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-logo-white.png" media="(prefers-color-scheme: dark)" />
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)" />
      <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" alt="Sentry" width="280">
    </picture>
  </a>
</p>

<h1>Sentry Wizard</h1>
<h4>The Sentry Wizard helps you set up your React Native, Cordova, Electron or Next.js projects with Sentry.</h4>

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

At the current moment, the wizard is meant to be used for React Native, Cordova, Electron or Next.js. If you have other platforms you would like the wizard to support, please open a [GitHub issue](https://github.com/getsentry/sentry-wizard/issues)!

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
  -s, --signup       Redirect to signup page if not logged in          [boolean]
```

## Resources

- [![Forum](https://img.shields.io/badge/forum-sentry-green.svg)](https://forum.sentry.io/c/sdks)
- [![Discord](https://img.shields.io/discord/621778831602221064)](https://discord.gg/Ww9hbqr)
- [![Stack Overflow](https://img.shields.io/badge/stack%20overflow-sentry-green.svg)](http://stackoverflow.com/questions/tagged/sentry)
- [![Twitter Follow](https://img.shields.io/twitter/follow/getsentry?label=getsentry&style=social)](https://twitter.com/intent/follow?screen_name=getsentry)
