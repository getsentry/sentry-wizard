# Test Wizard Integration

Test the wizard for a specific integration locally.

Usage: `/test-wizard <integration-name>`

Steps:
1. Build the wizard: `yarn build`
2. Run the wizard with the specified integration: `yarn try -i <integration-name>`

Available integrations: nextjs, react-native, remix, sveltekit, nuxt, angular, flutter, ios, android, sourcemaps

If testing requires a specific test application, navigate to the appropriate directory in `e2e-tests/test-applications/` first.
