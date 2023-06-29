import {
  defaultStackParser,
  Hub,
  Integrations,
  makeMain,
  makeNodeTransport,
  NodeClient,
  runWithAsyncContext,
} from '@sentry/node';
import packageJson from '../package.json';

export async function withTelemetry<F>(
  options: {
    enabled: boolean;
    integration: string;
  },
  callback: () => F | Promise<F>,
): Promise<F> {
  const { sentryHub, sentryClient } = createSentryInstance(
    options.enabled,
    options.integration,
  );

  makeMain(sentryHub);

  const transaction = sentryHub.startTransaction({
    name: 'sentry-wizard-execution',
    status: 'ok',
  });
  sentryHub.getScope().setSpan(transaction);
  const sentrySession = sentryHub.startSession();
  sentryHub.captureSession();

  try {
    return await runWithAsyncContext(() => callback());
  } catch (e) {
    sentryHub.captureException('Error during wizard execution.');
    transaction.setStatus('internal_error');
    sentrySession.status = 'crashed';
    throw e;
  } finally {
    transaction.finish();
    sentryHub.endSession();
    await sentryClient.flush(3000);
  }
}

function createSentryInstance(enabled: boolean, integration: string) {
  const client = new NodeClient({
    dsn: 'https://8871d3ff64814ed8960c96d1fcc98a27@o1.ingest.sentry.io/4505425820712960',
    enabled: enabled,

    tracesSampleRate: 1,
    sampleRate: 1,

    release: packageJson.version,
    integrations: [new Integrations.Http()],
    tracePropagationTargets: [/^https:\/\/sentry.io\//],

    stackParser: defaultStackParser,

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

    transport: makeNodeTransport,
  });

  const hub = new Hub(client);

  hub.setTag('integration', integration);
  hub.setTag('node', process.version);
  hub.setTag('platform', process.platform);

  return { sentryHub: hub, sentryClient: client };
}
