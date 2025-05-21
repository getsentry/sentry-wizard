/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import * as Sentry from '@sentry/cloudflare';

export default Sentry.withSentry(
	(env) => ({
		dsn: 'https://81dc78d634ce0f02998bdb57b02d4353@o447951.ingest.us.sentry.io/4507651862888448',
	}),
	{
		async fetch(request, env, ctx) {
			throw new Error('Test error');
			return new Response('Hello World!');
		},
	} satisfies ExportedHandler<Env>
);
