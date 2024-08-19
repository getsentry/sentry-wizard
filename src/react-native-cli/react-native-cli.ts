import { withTelemetry } from '../telemetry';
import { printWelcome } from '../utils/clack-utils';
import { WizardOptions } from '../utils/types';

export async function runReactNativeCli(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'sourcemaps',
    },
    () => runReactNativeCliWithTelemetry(options),
  );
}

async function runReactNativeCliWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry React Native CLI',
    message: `This command line tool will help you generate React Native bundle and source maps.
Thank you for using Sentry :)${
      options.telemetryEnabled
        ? `

(This tool sends telemetry data and crash reports to Sentry.
You can turn this off by running the wizard with the '--disable-telemetry' flag.)`
        : ''
    }`,
    promoCode: options.promoCode,
  });

  await Promise.resolve();
}
