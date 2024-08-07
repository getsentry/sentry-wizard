export interface SentryProjectData {
  id: string;
  slug: string;
  status: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    region: string;
    status: {
      id: string;
      name: string;
    };
  };
  keys: [{ dsn: { public: string }; isActive: boolean }];
}

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

  /**
   * If this is set, the wizard will skip the login and project selection step.
   * (This can not yet be set externally but for example when redirecting from
   * one wizard to another when the project was already selected)
   */
  preSelectedProject?: {
    project: SentryProjectData;
    authToken: string;
    selfHosted: boolean;
  };
};

export interface Feature {
  id: string;
  prompt: string;
  enabledHint?: string;
  disabledHint?: string;
}
