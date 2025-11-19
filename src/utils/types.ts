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

  /**
   * Force-install the SDK package to continue with the installation in case
   * any package manager checks are failing (e.g. peer dependency versions).
   *
   * Use with caution and only if you know what you're doing.
   *
   * Does not apply to all wizard flows (currently NPM only)
   */
  forceInstall?: boolean;

  /**
   * Used when the wizard command is copied from partner sites (e.g. Vercel)
   * to display login/signup instructions specific to organizations provisioned
   * through the partner.
   */
  comingFrom?: string;

  /**
   * If this is set, the wizard will ignore any git changes in the project and not prompt for confirmation.
   */
  ignoreGitChanges?: boolean;
  
  /**
   * Enable Spotlight mode for local development without Sentry authentication.
   * When enabled:
   * - Skips login and project selection
   * - Uses empty DSN
   * - Skips auth token file creation
   * This can be passed via the `--spotlight` arg.
   */
  spotlight?: boolean;
}; 

export interface Feature {
  id: string;
  prompt: string;
  enabledHint?: string;
  disabledHint?: string;
}
