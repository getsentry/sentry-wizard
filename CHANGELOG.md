# Changelog

## 2.6.1

- fix(rn): Upload debug files from `$DWARF_DSYM_FOLDER_PATH` during Xcode build ([#240](https://github.com/getsentry/sentry-wizard/pull/240))

## 2.6.0

- feat(rn): Support patching app/build.gradle RN 0.71.0 and Expo SDK 43+ bare workflow ([#229](https://github.com/getsentry/sentry-wizard/pull/229))

## 2.5.0

- feat: Merge next.config.js files automatically (#222)

## 2.4.2

- feat(nextjs): Add sentry.edge.config.js template (#227)

## 2.4.1

- feat: Add logic to add @sentry/nextjs if it's missing when running the wizard
  (#219)
- fix: Print localhost with `http` instead of `https` (#212)
- feat: Add project_platform as query param if -s and -i are set (#221)
- feat: Add promo code option used for signup flows (#223)

## 2.4.0

- Raise nextjs version limit to include 13 (#206)
- feat(react-native): Xcode plugin includes collect modules script (#210)

## 1.4.0

- feat(react-native): Xcode plugin includes collect modules script (#213)

## 2.3.1

- fix(nextjs): Always check for both `next` and `@sentry/nextjs` presence and
  version (#209)
- fix: `cli.executable` property should be resolved from cwd (#211)

## 2.3.0

- feat(react-native): Xcode plugin debug files upload can include source using
  env
- chore(ci): remove jira workflow (#204)

## 2.2.2

- feat(nextjs): Remove option to auto-wrap data fetchers and API routes (#196)

## 2.2.1

- feat(nextjs): Add option to auto-wrap data fetchers and API routes to Next.js
  config (#194)

## 2.2.0

- ref(nextjs): Default to hiding source maps in nextjs config (#188)

## 2.1.0

- feat(react-native): Add support for RN TypeScript and other templates

## 2.0.2

- fix(electron): Remove Electron symbols.js script

## 2.0.1

- feat(nextjs): Add page to send onboarding sample error for Next.js (#179)

## 2.0.0

- fix(react-native) Xcode linking for RN 0.69 and higher (#178)

## 1.3.0

- chore(deps): Bump sentry-cli to 1.72.0 (#154)
- feat(nextjs): Use helper function in `_error.js` (#170)
- fix(electron): Fix version detection to use electron/package.json (#161)

## 1.2.17

- Support Next.js v12 (#152)

## 1.2.16

- fix(nextjs): Do not capture 404s as exceptions in `_error` (#146)

## 1.2.15

- Check version range rather than minimum version for nextjs (#143)

## 1.2.14

- Automatically include `pages/_error.js` when setting up nextjs project (#140)
- Clarify "Usage" section of `README.md` (#139)

## 1.2.13

- Fix `.sentryclirc` file formatting (#131)

## 1.2.12

- Don't expose auth token in `sentry.properties` (#128)

## 1.2.11

- Parse Next.js version as a string, instead of int (#122)

## 1.2.10

- Check new contents before overwriting a file (#117)

## 1.2.9

- Add performance monitoring support to nextjs scripts (#114)
- Make webpack silent by default in nextjs config (#113)

## v1.2.8

- Fix React Native JS patching throwing errors due to incorrect argument

## v1.2.7

- Fix React Native uninstall script
- Fix platform selection issues and repeated prompts on Mobile Projects.

## v1.2.6

- Get release from environment for the Next.js SDK

## v1.2.5

- Ignore coverage when linting and clarify Next.js messages.

## v1.2.4

- Add Next.js SDK initialization config files.
- Update webpack config file of Next.js.

## v1.2.3

- Don't use `package` as a varname in the NextJS config
- Enable env variables in the NextJS config

## v1.2.2

- Add support for `NEXT_PUBLIC_SENTRY_DSN`

## v1.2.1

- Update `next.config.js`, and create mergeable configs when they already exist

## v1.2.0

- Add support for Next.js

## v1.1.4

- Bump @sentry/cli `1.52.4`

## v1.1.3

- Add sourcemap output path to derived data to react native ios script
- Bump @sentry/cli `1.52.3`

## v1.1.2

- Don't `cli/executable` for Android project on react-native

## v1.1.1

- Bump @sentry/cli `1.51.0`

## v1.1.0

- Bump @sentry/cli `1.50.0`

## v1.0.2

- Several dependeny bumps with related security updates

## v1.0.1

- Strip only `Sentry*` frameworks for Cordova
- Guard Xcode project updates for react-native

## v1.0.0

- Support for new `@sentry/react-native`

## v0.13.0

- Bump @sentry/cli `1.43.0`

## v0.12.1

- Bump @sentry/cli `1.36.1`

## v0.12.0

- Fixed #22
- Bumped dependencies

## v0.11.1

- Fixed #16

## v0.11.0

- Update all dependencies, Fix tests on travis

## v0.10.3

- Use public DSN for react-native

## v0.10.2

- Remove secret DSN part check for prompt

## v0.10.1

- Use opn in favor of open

## v0.10.0

- Change Cordova wizard steps to only run once and create properties file in
  root

## v0.9.7

- Fix a bug where sentry-wizard will ask for parameters on uninstall

## v0.9.6

- Fix electron symbol upload script

## v0.9.5

- Update Electron instructions to latest SDK version

## v0.9.4

- Restore Node compatibility
- Add more tests

## v0.9.3

- Fix Electron installation code - Fixes #7

## v0.9.2

- Support Electron prereleases in symbol upload
- Correctly upload Electron dSYMs for macOS

## v0.9.1

- Add strip arch script for cordova

## v0.9.0

- Add support for electron projects

## v0.8.3

- Fixed an issue where file exsists always returned false

## v0.8.2

- Move sentry.properties file to plugins folder for Cordova

## v0.8.1

- Fix react-native js file patching
- Bump sentry-cli to 1.28.4

## v0.8.0

- Fix Cordova sentry-cli upload-dsym command for Xcode

## v0.7.5

- Bump sentry-cli version to 1.28.1

## v0.7.4

- Bump sentry-cli version to 1.27.1
- Fix Cordova integration
- Fix issue in file checker to default to false

## v0.7.3

- Bump sentry-cli version

## v0.7.2

- Fix quiet mode and default parameter
- Fix version detection for @sentry/cli

## v0.7.1

- Improve function call for wizard and parameter validation/sanitation

## v0.7.0

- Use @sentry/cli

## v0.6.1

- Fixed https://github.com/getsentry/react-native-sentry/issues/304

## v0.6.0

- Add quiet mode --quiet
- Fallback to user prompts when not able to connect to Sentry
- Renamed parameter type/protype to integration

## v0.5.3

- Passing answers fixed in file helper

## v0.5.2

- Platform check

## v0.5.1

- Fix skip connection also for polling

## v0.5.0

- Add skip connection option to skip connecting to Sentry
- Add possiblity to overwrite args with ENV vars SENTRY_WIZARD prefixed

## v0.4.0

- Fix uninstall step for react-native

## v0.3.2

- Fix sentry-cli version

## v0.3.1

- Fix polling and json reponse parsing

## v0.3.0

- Add support for cordova
- Internal refactorings
- Check if project is already setup

## v0.2.2

- Fix build process

## v0.2.1

- Fix build process

## v0.2.0

- Add support for react-native

## v0.1.1

- Fix build process

## v0.1.0

- Inital release
