export function getCloudflareWorkerTemplate(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
  },
): string {
  let performanceOptions = '';
  if (selectedFeatures.performance) {
    performanceOptions = `
		// Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
		tracesSampleRate: 1,`;
  }

  return `import * as Sentry from '@sentry/cloudflare';

export default Sentry.withSentry(
	(env) => ({
		dsn: '${dsn}',${performanceOptions}
	}),
	{
		async fetch(request, env, ctx): Promise<Response> {
			// Your worker logic here
			return new Response('Hello World!');
		},
	} satisfies ExportedHandler<Env>,
);
`;
}
