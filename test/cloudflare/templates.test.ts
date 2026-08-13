import { describe, expect, it } from 'vitest';
import { getCloudflareWorkerTemplate } from '../../src/cloudflare/templates';

describe('Cloudflare code templates', () => {
  describe('getCloudflareWorkerTemplate', () => {
    it('generates worker template with performance monitoring enabled', () => {
      const template = getCloudflareWorkerTemplate('my-dsn', {
        performance: true,
      });

      expect(template).toMatchInlineSnapshot(`
        "import * as Sentry from '@sentry/cloudflare';

        export default Sentry.withSentry(
        	(env) => ({
        		dsn: 'my-dsn',
        		// Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
        		tracesSampleRate: 1,
        	}),
        	{
        		async fetch(request, env, ctx): Promise<Response> {
        			// Your worker logic here
        			return new Response('Hello World!');
        		},
        	} satisfies ExportedHandler<Env>,
        );
        "
      `);
    });

    it('generates worker template with performance monitoring disabled', () => {
      const template = getCloudflareWorkerTemplate('my-dsn', {
        performance: false,
      });

      expect(template).toMatchInlineSnapshot(`
        "import * as Sentry from '@sentry/cloudflare';

        export default Sentry.withSentry(
        	(env) => ({
        		dsn: 'my-dsn',
        	}),
        	{
        		async fetch(request, env, ctx): Promise<Response> {
        			// Your worker logic here
        			return new Response('Hello World!');
        		},
        	} satisfies ExportedHandler<Env>,
        );
        "
      `);
    });

    it('includes the correct DSN', () => {
      const dsn = 'https://example@sentry.io/123';
      const template = getCloudflareWorkerTemplate(dsn, {
        performance: true,
      });

      expect(template).toContain(`dsn: '${dsn}'`);
    });

    it('wraps handler with Sentry.withSentry', () => {
      const template = getCloudflareWorkerTemplate('my-dsn', {
        performance: false,
      });

      expect(template).toContain('Sentry.withSentry');
      expect(template).toContain('async fetch(request, env, ctx)');
      expect(template).toContain('satisfies ExportedHandler<Env>');
    });
  });
});
