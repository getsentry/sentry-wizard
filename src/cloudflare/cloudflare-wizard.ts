// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import { traceStep, withTelemetry } from '../telemetry';
import {
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  printWelcome,
  runPrettierIfInstalled,
} from '../utils/clack';
import { offerProjectScopedMcpConfig } from '../utils/clack/mcp-config';
import { hasPackageInstalled } from '../utils/package-json';
import type { WizardOptions } from '../utils/types';
import { createSentryInitFile } from './sdk-setup';
import { abortIfSpotlightNotSupported } from '../utils/abort-if-sportlight-not-supported';
import { ensureWranglerConfig } from './wrangler/ensure-wrangler-config';
import { updateWranglerConfig } from './wrangler/update-wrangler-config';

export async function runCloudflareWizard(
  options: WizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'cloudflare',
      wizardOptions: options,
    },
    () => runCloudflareWizardWithTelemetry(options),
  );
}

async function runCloudflareWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  const { promoCode, telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry Cloudflare Wizard',
    promoCode,
    telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges: options.ignoreGitChanges,
    cwd: undefined,
  });

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, 'wrangler', 'Cloudflare');

  traceStep('Ensure Wrangler config', () => {
    ensureWranglerConfig();
  });

  await traceStep('Update Wrangler config with Sentry requirements', () =>
    updateWranglerConfig({
      compatibility_flags: ['nodejs_als'],
      compatibility_date: new Date().toISOString().slice(0, 10),
      version_metadata: {
        binding: 'CF_VERSION_METADATA',
      },
    }),
  );

  const projectData = await getOrAskForProjectData(
    options,
    'node-cloudflare-workers',
  );

  if (projectData.spotlight) {
    return abortIfSpotlightNotSupported('Cloudflare');
  }

  const { selectedProject } = projectData;

  await installPackage({
    packageName: '@sentry/cloudflare@^10',
    packageNameDisplayLabel: '@sentry/cloudflare',
    alreadyInstalled: hasPackageInstalled('@sentry/cloudflare', packageJson),
    forceInstall,
  });

  const selectedFeatures = await featureSelectionPrompt([
    {
      id: 'performance',
      prompt: `Do you want to enable ${chalk.bold(
        'Tracing',
      )} to track the performance of your application?`,
      enabledHint: 'recommended',
    },
  ] as const);

  traceStep('Create Sentry initialization', () =>
    createSentryInitFile(selectedProject.keys[0].dsn.public, selectedFeatures),
  );

  await runPrettierIfInstalled({ cwd: undefined });

  // Offer optional project-scoped MCP config for Sentry with org and project scope
  await offerProjectScopedMcpConfig(
    selectedProject.organization.slug,
    selectedProject.slug,
  );

  clack.outro(buildOutroMessage());
}

export function buildOutroMessage(): string {
  return `
  ${chalk.green(
    'Sentry has been successfully configured for your Cloudflare project.',
  )}

  ${chalk.dim('Next steps:')}
  ${chalk.dim('1. Wrap your worker with Sentry as instructed above')}
  ${chalk.dim('2. Deploy your application with:')} ${chalk.cyan(
    'wrangler deploy',
  )}
  ${chalk.dim('3. Trigger an error to test Sentry integration')}

  ${chalk.cyan(
    `To learn more about using Sentry with Cloudflare, visit:
  https://docs.sentry.io/platforms/javascript/guides/cloudflare/`,
  )}
  `;
}
