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
<h4>The Sentry Wizard helps you set up your React Native, Flutter, Apple, Android, Cordova, Electron, Next.js, Nuxt, Remix or SvelteKit projects with Sentry.</h4>

[![npm version](https://img.shields.io/npm/v/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![npm dm](https://img.shields.io/npm/dm/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![npm dt](https://img.shields.io/npm/dt/@sentry/wizard.svg)](https://www.npmjs.com/package/@sentry/wizard)
[![Discord Chat](https://img.shields.io/discord/621778831602221064.svg)](https://discord.gg/Ww9hbqr)

![GitHub Actions](https://github.com/getsentry/sentry-wizard/actions/workflows/build.yml/badge.svg)
[![Codecov](https://codecov.io/gh/getsentry/sentry-wizard/graph/badge.svg?token=fQNlGihNOf)](https://codecov.io/gh/getsentry/sentry-wizard)

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

At the current moment, the wizard can be used for Next.js, react-native, iOS, Flutter, Nuxt, Remix, Sveltekit, Android, Electron, Cordova, and for sourcemaps setup. If you have other platforms you would like the wizard to support, please open a [GitHub issue](https://github.com/getsentry/sentry-wizard/issues)!

# Options

The following CLI arguments are available:

| Option                | Description                                                       | Type    | Default                                 | Choices                                                                                                                | Environment Variable         |
| --------------------- | ----------------------------------------------------------------- | ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `--help`              | Show help                                                         | boolean |                                         |                                                                                                                        |                              |
| `--version`           | Show version number                                               | boolean |                                         |                                                                                                                        |                              |
| `--debug`             | Enable verbose logging                                            | boolean | `false`                                 |                                                                                                                        | `SENTRY_WIZARD_DEBUG`        |
| `--uninstall`         | Revert project setup process. Not available for all integrations. | boolean | `false`                                 |                                                                                                                        | `SENTRY_WIZARD_UNINSTALL`    |
| `--skip-connect`      | Skips the connection to the server                                | boolean | `false`                                 |                                                                                                                        | `SENTRY_WIZARD_SKIP_CONNECT` |
| `--quiet`             | Do not fallback to prompting user asking questions                | boolean | `false`                                 |                                                                                                                        | `SENTRY_WIZARD_QUIET`        |
| `-i, --integration`   | Choose the integration to setup                                   | choices | Select integration during setup         | "reactNative", "flutter", ios", "android", "cordova", "electron", "nextjs", "nuxt", "remix", "sveltekit", "sourcemaps" | `SENTRY_WIZARD_INTEGRATION`  |
| `-p, --platform`      | Choose platform(s)                                                | array   | Select platform(s) during setup         | "ios", "android"                                                                                                       | `SENTRY_WIZARD_PLATFORM`     |
| `-u, --url`           | The URL to your Sentry installation                               | string  | `https://sentry.io`                     |                                                                                                                        | `SENTRY_WIZARD_URL`          |
| `--project`           | The Sentry project slug to use                                    | string  | Select project during setup             |                                                                                                                        |                              |
| `--org`               | The Sentry org slug to use                                        | string  | Select org during setup                 |                                                                                                                        |                              |
| `--saas`              | Skip the self-hosted or SaaS URL selection process                | boolean | Select self-hosted or SaaS during setup |                                                                                                                        |                              |
| `-s, --signup`        | Redirect to signup page if not logged in                          | boolean | `false`                                 |                                                                                                                        |                              |
| `--disable-telemetry` | Don't send telemetry data to Sentry                               | boolean | `false`                                 |                                                                                                                        |                              |
| `--force-install`     | Force install the SDK NPM package (use with caution!)             | boolean | `false`                                 |                                                                                                                        |                              |

## Resources

- [![Forum](https://img.shields.io/badge/forum-sentry-green.svg)](https://forum.sentry.io/c/sdks)
- [![Discord](https://img.shields.io/discord/621778831602221064)](https://discord.gg/Ww9hbqr)
- [![Stack Overflow](https://img.shields.io/badge/stack%20overflow-sentry-green.svg)](http://stackoverflow.com/questions/tagged/sentry)
- [![Twitter Follow](https://img.shields.io/twitter/follow/getsentry?label=getsentry&style=social)](https://twitter.com/intent/follow?screen_name=getsentry)
