import * as Sentry from '@sentry/node';
import type { Span } from '@sentry/node';
import type { WizardOptions } from './utils/types';
import { WIZARD_VERSION } from './version';

export async function withTelemetry<F>(
  options: {
    enabled: boolean;
    integration: string;
    wizardOptions: WizardOptions;
  },
  callback: () => F | Promise<F>,
): Promise<F> {
  const client = initSentry(options.enabled, options.integration);

  Sentry.startSession();
  Sentry.captureSession();

  // Set tag for passed CLI args
  Sentry.setTag('args.project', !!options.wizardOptions.projectSlug);
  Sentry.setTag('args.org', !!options.wizardOptions.orgSlug);
  Sentry.setTag('args.saas', !!options.wizardOptions.saas);

  try {
    return await Sentry.startSpan(
      {
        name: 'sentry-wizard-execution',
        op: 'wizard.flow',
      },
      async () => {
        updateProgress('start');
        const res = await Sentry.withIsolationScope(callback);
        updateProgress('finished');

        return res;
      },
    );
  } catch (e) {
    Sentry.captureException('Error during wizard execution.');
    const currentSession = Sentry.getCurrentScope().getSession();
    if (currentSession) {
      currentSession.status = 'crashed';
    }
    throw e;
  } finally {
    Sentry.endSession();
    await client?.flush(3000).then(null, () => {
      // If telemetry flushing fails we generally don't care
    });
    await Sentry.flush(3000).then(null, () => {
      // If telemetry flushing fails we generally don't care
    });
  }
}

function initSentry(
  enabled: boolean,
  integration: string,
): Sentry.NodeClient | undefined {
  const client = Sentry.init({
    dsn: 'https://8871d3ff64814ed8960c96d1fcc98a27@o1.ingest.sentry.io/4505425820712960',
    enabled: enabled,
    defaultIntegrations: false,
    integrations: [Sentry.httpIntegration()],
    environment: `production-${integration}`,

    tracesSampleRate: 1,
    sampleRate: 1,

    release: WIZARD_VERSION,
    tracePropagationTargets: [/^https:\/\/sentry.io\//],

    beforeSendTransaction: (event) => {
      delete event.server_name; // Server name might contain PII
      return event;
    },

    beforeSend: (event) => {
      event.exception?.values?.forEach((exception) => {
        delete exception.stacktrace;
      });

      delete event.server_name; // Server name might contain PII
      return event;
    },
  });

  Sentry.setTag('integration', integration);
  Sentry.setTag('node', process.version);
  Sentry.setTag('platform', process.platform);

  try {
    // The `require` call here is fine because the binary node versions
    // support `require` and we try/catch the call anyway for any other
    // version of node.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sea = require('node:sea') as { isSea: () => boolean };
    Sentry.setTag('is_binary', sea.isSea());
  } catch {
    Sentry.setTag('is_binary', false);
  }

  return client;
}

export function traceStep<T>(
  step: string,
  callback: (span: Span | undefined) => T,
): T {
  updateProgress(step);
  return Sentry.startSpan({ name: step, op: 'wizard.step' }, (span) =>
    callback(span),
  );
}

export function updateProgress(step: string) {
  Sentry.setTag('progress', step);
}
