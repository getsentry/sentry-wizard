export interface SentryProjectData {
  id: string;
  slug: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  keys: [{ dsn: { public: string } }];
}

export type PreselectedProject = {
  project: SentryProjectData;
  authToken: string;
  selfHosted: boolean;
};

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
   * The org to pre-select in the wizard.
   * This can be passed via the `--org` arg.
   * Example: `--org my-org`
   */
  orgSlug?: string;

  /**
   * Project slug to pre-select in the wizard.
   * This can be passed via the `--project` arg.
   * Example: `--project my-project`
   */
  projectSlug?: string;

  /**
   * If this option is set, the wizard will skip the self-hosted or SaaS
   * selection step and directly assume that the wizard is used for Sentry SaaS.
   */
  saas?: boolean;

  /**
   * If this is set, the wizard will skip the login and project selection step.
   */
  preSelectedProject?: PreselectedProject;
};

export interface Feature {
  id: string;
  prompt: string;
  enabledHint?: string;
  disabledHint?: string;
}
