
# Sentry React Native CLI

Command line to to export bundle and source maps and upload them to Sentry.
The created artifacts are the same as the embedded files by the React Native/Expo tooling
in the native applications.

Supports React Native 0.70 and above.
Supports Expo SDK 50 and above.

The tool automatically detect the used Javascript engine, Javascript Core or Hermes. Expo configuration is automatically detected and Expo CLI is used. RAM bundles are not supported. When run in CI the non-interactive mode is automatically enabled.

## Export only

Yes, it's that simple just one command to generate your embedded javascript bundle and source map.

```bash
@sentry/wizard react-native-cli export
```

## Export with upload

To automatically upload the exported bundle and source map just add `--upload` and specify `--org my-org-slug` and `--project my-project-slug`.

```bash
@sentry/wizard react-native-cli export --upload --org my-org-slug --project my-project-slug
```
