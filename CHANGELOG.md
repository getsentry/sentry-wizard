# Changelog

## 3.32.0

- feat: Add `--saas` CLI arg to skip self-hosted or SaaS selection step (#678)
- ref: Add `--project` and `--org` args to help message and update readme (#679)

## 3.31.0

- fix(sveltekit): Create bundler plugin env file instead of sentryclirc (#675)
- fix(check-sdk-version): update sentry sdk packages (#676)
- feat(telemetry): Add telemetry for org and project CLI argument usage (#677)

## 3.30.0

- feat: Allow passing org and project slug parameters (#671)

## 3.29.0

- ref(nextjs): Adjust dev server command in verification message (#665)
- feat(remix): Add feature selection (#646)
- feat: Try running Prettier on exit (#644)
- fix(remix): Don't create `.sentrclirc` if project uses Vite (#667)

## 3.28.0

- feat(nextjs): Add `onRequestError` to `instrumentation.ts` (#659)
- feat(nextjs): Warn about Turbopack incompatibility (#657)
- feat(sveltekit): Add feature selection (#648)

## 3.27.0

- feat(nextjs): Add feature selection (#631)
- fix(nextjs): Don't inject replay integration in server configs (#651)
- fix(deps): fix(deps): Add `recast` as a direct dependency (#653)
- fix: Fix issue stream URL for self-hosted instances (#645)
- feat: Detect Yarn v2+ (#652)

Work in this release contributed by @MaximAL. Thank you for your contributions!

## 3.26.0

- fix(nextjs): Don't add '.env.sentry-build-plugin' to .gitignore if it's
  already there (#610)
- feat(nextjs): Support all `next.config` file types (#630)
- fix(nextjs): Update instrumentation and example creation logic for app or
  pages usage (#629)
- feat(nextjs): Prompt for `reactComponentAnnotation` (#634)
- fix(nextjs): Add missing Error.getInitialProps calls in Next.js error page
  snippets (#632)
- fix/feat: Improve error logging for package installation (#635)
- fix: Properly close open handles (#638)

## 3.25.2

- ref: Improve intro and wizard selection (#625)

## 3.25.1

- fix(remix): Change `handleError` in server entry (#621)

## 3.25.0

- feat(react-native): Add support for Expo projects (#505)

## 3.24.1

- fix(nextjs): Add trailing comma to `sentryUrl` option in `withSentryConfig`
  template (#601)

## 3.24.0

- feat(remix): Switch to OTEL setup (#593)
- feat(remix): Update `start` script for built-in Remix servers (#604)
- deps: Bump glob to `10.4.2` (#599)

## 3.23.3

- fix(nextjs): Fix Types of GlobalError (#592)

## 3.23.2

- feat(nextjs): Detect typescript usage and emit files accordingly (#580)
- fix(step-wizards): Show correct URL when prompting DSN (#577)
- feat(electron): Update code examples for v5 (#591)

## 3.23.1

- fix(nextjs): Replace `url` with `sentryUrl` in `withSentryConfig` options
  (#579)

## 3.23.0

- feat(apple): Disable build script sandboxing (#574)
- feat(reactnative): Added comment to add spotlight in Sentry.init for React
  Native config (#548)
- feat(reactnative): Added `withSentryConfig` Metro patch (#575)

## 3.22.3

- feat(nextjs): Make example page resilient to
  `typescript-eslint/no-floating-promises` (#568)
- fix: Remove quotes around auth token in .env files (#570)
- fix(nextjs): Remove `transpileClientSDK` from template (#571)

## 3.22.2

- feat(nextjs): Adjust Next.js wizard for usage with v8 SDK (#567)

## 3.22.1

- fix(wizard): Handle missing auth token in wizard API endpoint response (#566)

## 3.22.0

- feat(nextjs): Ask users about tunnelRoute option (#556)

## 3.21.0

- feat(nextjs): Add comment to add spotlight in Sentry.init for Next.js server
  config (#545)
- feat(nextjs): Pin installed Next.js SDK version to version 7 (#550)
- feat(remix): Add example page (#542)
- feat(sveltekit): Add comment for spotlight in Sentry.init for SvelteKit server
  hooks config (#546)
- ref(nextjs): Add note about `tunnelRoute` and Next.js middleware
  incompatibility (#544)
- ref(remix): Remove Vite dev-mode modification step (#543)

## 3.20.5

- fix: Update `@clack/core` to fix selection error on Windows (#539)

## 3.20.4

- ref(remix): Replace `BrowserTracing` with `browserTracingIntegration` (#533)

## 3.20.3

- ref(nextjs): Replace `new Replay()` with `replayIntegration` (#532)
- ref(remix): Replace `new Replay()` with `replayIntegration` (#532)
- ref(sveltekit): Replace `new Replay()` with `replayIntegration` (#532)

## 3.20.2

- ref(wizard): Print error object if wizard endpoint API request failed (#524)

## 3.20.1

- fix(nextjs): Replace deprecated Sentry API calls in example page templates
  (#520)
- fix(sveltekit): Replace deprecated Sentry API calls in example page templates
  (#520)

## 3.20.0

- feat(nextjs): Ask for confirmation before creating example page (#515)
- feat(remix): Add instrumentation step for Express server adapters (#504)
- feat(sveltekit): Add instrumentation step for Express server adapters (#516)
- fix(nextjs): Instruct users to restart dev server after setup (#513)
- ref(sveltekit): Improve Outro Message (#514)

## 3.19.0

- feat(nextjs): Add instructions on how to set auth token in CI (#511)

## 3.18.1

- fix(nextjs): Fix app folder lookup (#510)

## 3.18.0

- feat(nextjs): Add instructions on how to add a `global-error` page to Next.js
  App Router (#506)
- feat(nextjs): Automatically enable vercel cron monitors (#507)

## 3.17.0

- feat(reactnative): Use Xcode scripts bundled with Sentry RN SDK (#499)
- feat(reactnative): Make `pod install` step optional (#501)
- feat(remix): Add Vite support (#495)
- feat(reactnative): Add Sentry Metro serializer (#502)

## 3.16.5

- fix(wizard): Update wizard API data type and issue stream url creation (#500)

## 3.16.4

- feat(nextjs): Add instructions for custom \_error page (#496)

## 3.16.3

- fix(sourcemaps): Re-read package.json when modifying build command (#493)

## 3.16.2

- fix(sourcemaps): Re-read package.json after CLI install (#489)
- fix(nextjs): Set created test route handler to always be dynamic (#486)

## 3.16.1

- fix(Cordova): Skip dynamic libraries on Cordova (#481)

## 3.16.0

- ref(reactnative): Use clack prompts and share common code (dirty repo, login)
  (#473)
- feat(reactnative): Add telemetry (#477)
- feat(reactnative): Improve `build.gradle` patch so that it's more likely to
  work without changes in monorepos (#478)
- fix(reactnative): Save Sentry URL, Organization and Project to
  `sentry.properties` (#479)

## 3.15.0

- feat(remix): Support sourcemap uploads of Hydrogen apps (#474)
- fix(remix): Use captureRemixServerException inside handleError (#466)
- fix(remix): Fix `request` arg in `handleError` template (#469)
- fix(remix): Update documentation links to the new routes (#470)
- fix(remix): Instrument existing root `ErrorBoundary` (#472)

## 3.14.1

- ref(sveltekit): Add log for successful Vite plugin insertion (#465)

## 3.14.0

- feat(nextjs): Add telemetry collection to NextJS wizard (#458)
- feat(wizard): Ask for confirmation to continue if git repo is not clean (#462)
- fix(remix): Fix Remix version and TS checks (#464)

## 3.13.0

- enh(android): Show link to issues page after setup is complete (#448)
- feat(remix): Pass `org`, `project`, `url` to `upload-sourcemaps` script (#434)
- feat(sourcemaps): Automatically enable source maps generation in
  `tsconfig.json` (#449)
- feat(sveltekit): Add telemetry collection (#455)
- fix(nextjs): Add selfhosted url in `next.config.js` (#438)
- fix(nextjs): Create necessary directories in app router (#439)
- fix(sourcemaps): Write package manager command instead of object to
  package.json (#453)
- ref(sveltekit): Check for minimum supported SvelteKit version (#456)

Work in this release contributed by @andreysam. Thank you for your
contributions!

## 3.12.0

- feat(sourcemaps): Automatically insert Sentry Webpack plugin (#432)
- fix(android): Add support for unusual import statements (#440)
- fix(wizard): Sort projects in project-selection step (#441)
- enh(android): Add more telemetry (#435)

## 3.11.0

- feat(android): Add wizard support for Android (#389)

Set up the Sentry Android SDK in your app with one command:

```sh
npx @sentry/wizard@latest -i android
# or via brew
brew install getsentry/tools/sentry-wizard && sentry-wizard -i android
```

- feat(craft): Add `brew` target for automatically publishing `sentry-wizard` to
  Sentry's custom Homebrew tap (#406)

You can now install `sentry-wizard` via Homebrew:

```sh
brew update
brew install getsentry/tools/sentry-wizard
```

- feat: Add Bun package manager support (#417)
- feat(apple): Add option to choose between cocoapods when available and SPM
  (#423)
- feat(apple): Search App entry point by build files not directories (#420)
- feat(apple): Use ".sentryclirc" for auth instead of hard coding it (#422)
- feat(nextjs): Add support for Next.js 13 app router (#385)
- feat(sourcemaps): Provide exit path if there's no need to upload sourcemaps
  (#415)
- fix: Handle no projects available (#412)
- fix: Remove picocolor usage (#426)
- fix: Support org auth tokens in old wizards (#409)
- fix: Treat user-entered DSN as a public DSN (#410)
- fix(sourcemaps): Enable source map generation when modifying Vite config
  (#421)

## 3.10.0

- feat(remix): Add Remix wizard (#387)

Set up the Sentry Remix SDK in your app with one command:

```sh
npx @sentry/wizard@latest -i remix
```

- fix(cordova): Fallback to the default Sentry CLI path if not defined. (#401)

## 3.9.2

- fix(sentry-cli-sourcemaps): Fix writing of build command (#398)

## 3.9.1

- ref(sourcemaps): Handle no vite config found case (#391)
- ref(sourcemaps): Improve handling of vite config already having Sentry code
  (#392)
- fix(apple): Don't remove other swift packages (#396)

## 3.9.0

- ref: Add debug logging to clack-based wizards (#381)
- fix: Pin minimum version to Node 14.18 (#383)
- feat(sourcemaps): Automatically insert Sentry Vite plugin in Vite config
  (#382)
- feat(reactnative): Use `with-environment.sh` in Xcode Build Phases (#329)
- fix(sveltekit): Bump `magicast` to handle vite configs declared as variables
  (#380)
- ref(sveltekit): Add vite plugin insertion fallback mechanism (#379)
- ref(sveltekit): Insert project config into vite config instead of
  `sentry.properties` (#378)

## 3.8.0

- feat: Autodetect more wizards (#370)
- feat(apple): iOS wizard has support for cocoapods (#350)
- feat(apple): Add Fastlane detector for iOS wizard (#356)
- feat(sourcemaps): Add dedicated NextJS sourcemaps flow (#372)
- feat(sourcemaps): Add option to add cli npm script to build command (#374)
- fix(login): Avoid repeatedly printing loading message (#368)
- fix(sveltekit): Abort the wizard when encountering an error (#376)
- ref(sourcemaps): Redirect to ReactNative wizard if RN project is detected
  (#369)

## 3.7.1

fix(telemetry): Re-enable telemetry collection (#361)

## 3.7.0

- feat(sourcemaps): Add path for users who don't use CI (#359)
- fix: Ensure wizard exits after setup is completed (#360)
- fix(sveltekit): Call correct API endpoint in Sentry example code (#358)
- ref(sveltekit): Create `.ts` hooks files if typescript is detected (#355)

## 3.6.0

- feat(apple): Add support for iOS (#334)
- feat(sourcemaps): Add CLI-based flow for Angular (#349)
- feat(sourcemaps): Detect SvelteKit and NextJS projects and redirect to
  dedicated wizards (#341)
- feat(sourcemaps): Pre-select auto-detected build tool option (#354)
- ref(sourcemaps): Improve Outro message (#344)

## 3.5.0

- feat(sourcemaps): Check if correct SDK version is installed (#336)
- feat: Open browser when logging in (sourcemaps, sveltekit, nextjs) (#328)
- feat(sourcmaps): Add create-react-app option (#335)
- fix: Support `--url` arg in NextJs, SvelteKit and Sourcemaps wizards (#331)
- fix: Update minimum Node version to Node 14 (#332)

## 3.4.0

- feat(sourcemaps): Add setup flow for esbuild (#327)
- feat(sourcemaps): Add setup flow for Rollup (#325)
- feat(sourcemaps): Add setup flow for `tsc` (#324)

## 3.3.2

- fix: Typo in gitignore insertion (#322)

## 3.3.1

- feat(sourcemaps): Record in telemetry which build tool was selected (#321)

## 3.3.0

- feat(sourcemaps): Add bundler selection prompt (#304)
- feat(sourcemaps): Add Login and Project Selection flow (#300)
- feat(sourcemaps): Add setup flow for sentry-cli (#314)
- feat(sourcemaps): Add setup flow for Vite (#308)
- feat(sourcemaps): Add setup flow for Webpack (#317)
- feat(sourcemaps): Add Sourcemaps as selectable integration (#302)
- feat(sourcemaps): Add telemetry (#318)
- feat(sourcemaps): Create `.env.sentry-build-plugin` instead of `.sentryclirc`
  to set auth token (#313)
- feat: Add empty sourcemaps wizard (#295)
- feat: Add single tenant to self-hosted question (#277)
- feat: Add telemetry helper (#309)
- feat: Improve error handling of incorrect self-hosted URLs (#299)
- fix: Add select with sliding window for project selection prompt (#306)

## 3.2.3

fix(sveltekit): Bump magicast to handle satisfies keyword (#279)

## 3.2.2

- fix: Don't crash in environments without browser (#272)
- fix: Add manual package manager selection as fallback (#275)
- fix(sveltekit): Use correct template when creating server hooks file (#276)

## 3.2.1

- ref(sveltekit): Prepend Vite plugin (#271)

## 3.2.0

- feat(sveltekit): Add support for SvelteKit SDK Setup (#251)

  Set up the Sentry SvelteKit SDK in your app with one command:

  ```sh
  npx @sentry/wizard -i sveltekit
  ```

- feat(rn): Add code snippet to send the first Sentry Error
  ([#263](https://github.com/getsentry/sentry-wizard/pull/263))
- fix(rn): Show loader when installing dependencies (#264)
- ref(nextjs): Clean up minor things (#258)
- ref(nextjs): Replace old Next.js wizard (#262)

## 3.1.0

- ref: Rewrite Next.js wizard (#256)

## 3.0.0

### Node Version Compatibility

- The minimum Node version for the wizard is now Node 14.

### Various fixes & improvements

- build: Update a bunch of dev dependencies (#248) by @lforst
- fix: Typo `hideSourcemaps` → `hideSourceMaps` (#231) by @maxbeier

## 2.7.0

- feat(rn): One line `@sentry/react-native` setup command (#243)

```bash
npx @sentry/wizard -s -i reactNative
```

## 2.6.1

- fix(rn): Upload debug files from `$DWARF_DSYM_FOLDER_PATH` during Xcode build
  (#240)

## 2.6.0

- feat(rn): Support patching app/build.gradle RN 0.71.0 and Expo SDK 43+ bare
  workflow (#229)

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
