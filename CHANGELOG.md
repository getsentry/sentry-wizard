# Changelog

## v0.9.5

* Update Electron instructions to latest SDK version

## v0.9.4

* Restore Node compatibility
* Add more tests

## v0.9.3

* Fix Electron installation code - Fixes #7

## v0.9.2

* Support Electron prereleases in symbol upload
* Correctly upload Electron dSYMs for macOS

## v0.9.1

* Add strip arch script for cordova

## v0.9.0

* Add support for electron projects

## v0.8.3

* Fixed an issue where file exsists always returned false

## v0.8.2

* Move sentry.properties file to plugins folder for Cordova

## v0.8.1

* Fix react-native js file patching
* Bump sentry-cli to 1.28.4

## v0.8.0

* Fix Cordova sentry-cli upload-dsym command for Xcode

## v0.7.5

* Bump sentry-cli version to 1.28.1

## v0.7.4

* Bump sentry-cli version to 1.27.1
* Fix Cordova integration
* Fix issue in file checker to default to false

## v0.7.3

* Bump sentry-cli version

## v0.7.2

* Fix quiet mode and default parameter
* Fix version detection for @sentry/cli

## v0.7.1

* Improve function call for wizard and parameter validation/sanitation

## v0.7.0

* Use @sentry/cli

## v0.6.1

* Fixed https://github.com/getsentry/react-native-sentry/issues/304

## v0.6.0

* Add quiet mode --quiet
* Fallback to user prompts when not able to connect to Sentry
* Renamed parameter type/protype to integration

## v0.5.3

* Passing answers fixed in file helper

## v0.5.2

* Platform check

## v0.5.1

* Fix skip connection also for polling

## v0.5.0

* Add skip connection option to skip connecting to Sentry
* Add possiblity to overwrite args with ENV vars SENTRY_WIZARD prefixed

## v0.4.0

* Fix uninstall step for react-native

## v0.3.2

* Fix sentry-cli version

## v0.3.1

* Fix polling and json reponse parsing

## v0.3.0

* Add support for cordova
* Internal refactorings
* Check if project is already setup

## v0.2.2

* Fix build process

## v0.2.1

* Fix build process

## v0.2.0

* Add support for react-native

## v0.1.1

* Fix build process

## v0.1.0

* Inital release
