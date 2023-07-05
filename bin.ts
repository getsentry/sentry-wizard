#!/usr/bin/env node
import { DEFAULT_URL, Integration, Platform } from './lib/Constants';
import { run } from './lib/Setup';
import { runNextjsWizard } from './src/nextjs/nextjs-wizard';
import { runSourcemapsWizard } from './src/sourcemaps/sourcemaps-wizard';
import { runSvelteKitWizard } from './src/sveltekit/sveltekit-wizard';
import { runAppleWizard } from './src/apple/apple-wizard';
import { withTelemetry } from './src/telemetry';
import { WizardOptions } from './src/utils/types';
export * from './lib/Setup';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const argv = require('yargs')
  .option('debug', {
    default: false,
    describe: 'Enable verbose logging\nenv: SENTRY_WIZARD_DEBUG',
    type: 'boolean',
  })
  .option('uninstall', {
    default: false,
    describe: 'Revert project setup process\nenv: SENTRY_WIZARD_UNINSTALL',
    type: 'boolean',
  })
  .option('skip-connect', {
    default: false,
    describe:
      'Skips the connection to the server\nenv: SENTRY_WIZARD_SKIP_CONNECT',
    type: 'boolean',
  })
  .option('quiet', {
    default: false,
    describe:
      'Do not fallback to prompting user asking questions\nenv: SENTRY_WIZARD_QUIET',
    type: 'boolean',
  })
  .option('i', {
    alias: 'integration',
    choices: Object.keys(Integration),
    describe: 'Choose the integration to setup\nenv: SENTRY_WIZARD_INTEGRATION',
  })
  .option('p', {
    alias: 'platform',
    choices: Object.keys(Platform),
    describe: 'Choose platform(s)\nenv: SENTRY_WIZARD_PLATFORM',
    type: 'array',
  })
  .option('u', {
    alias: 'url',
    default: undefined,
    describe: 'The url to your Sentry installation\nenv: SENTRY_WIZARD_URL',
  })
  .option('s', {
    alias: 'signup',
    default: false,
    describe: 'Redirect to signup page if not logged in',
    type: 'boolean',
  })
  .option('disable-telemetry', {
    default: false,
    describe: "Don't send telemetry data to Sentry",
    type: 'boolean',
  })
  .option('promo-code', {
    alias: 'promo-code',
    describe: 'A promo code that will be applied during signup',
  }).argv;

// Collect argv options that are relevant for the new wizard
// flows based on `clack`
const wizardOptions: WizardOptions = {
  url: argv.u as string | undefined,
  promoCode: argv['promo-code'] as string | undefined,
};

switch (argv.i) {
  case 'nextjs':
    // eslint-disable-next-line no-console
    runNextjsWizard(wizardOptions).catch(console.error);
    break;
  case 'sveltekit':
    // eslint-disable-next-line no-console
    runSvelteKitWizard(wizardOptions).catch(console.error);
    break;
  case 'sourcemaps':
    withTelemetry(
      {
        enabled: !argv['disable-telemetry'],
        integration: 'sourcemaps',
      },
      () => runSourcemapsWizard(wizardOptions),
      // eslint-disable-next-line no-console
    ).catch(console.error);
    break;
  case 'ios':
    // eslint-disable-next-line no-console
    runAppleWizard(wizardOptions).catch(console.error);
    break
  default:
    runOldWizard();
}

function runOldWizard() {
  // For the `clack`-based wizard flows, we don't want a default url value
  // For backwards-compatibility with the other flows, we fill it in here
  const argvWithUrlDefaults = {
    ...argv,
    url: argv.url || DEFAULT_URL,
    u: argv.u || DEFAULT_URL,
  };

  void run(argvWithUrlDefaults);
}
