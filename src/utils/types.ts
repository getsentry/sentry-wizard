export type WizardOptions = {
  /**
   * Controls whether the wizard should send telemetry data to Sentry.
   */
  telemetryEnabled: boolean;

  /**
   * The promo code to use while signing up for Sentry.
   * This can be passed via the --promo-code arg.
   */
  promoCode?: string;

  /**
   * The url of the Sentry instance to use.
   * This can be passed via the `-u` or `--url` arg.
   */
  url?: string;
};
