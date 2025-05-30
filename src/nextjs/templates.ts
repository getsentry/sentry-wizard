import chalk from 'chalk';
import { makeCodeSnippet } from '../utils/clack';

type WithSentryConfigOptions = {
  orgSlug: string;
  projectSlug: string;
  selfHosted: boolean;
  sentryUrl: string;
  tunnelRoute: boolean;
};

export function getWithSentryConfigOptionsTemplate({
  orgSlug,
  projectSlug,
  selfHosted,
  tunnelRoute,
  sentryUrl,
}: WithSentryConfigOptions): string {
  return `{
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: "${orgSlug}",
    project: "${projectSlug}",${
    selfHosted ? `\n    sentryUrl: "${sentryUrl}",` : ''
  }

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // ${
      tunnelRoute ? 'Route' : 'Uncomment to route'
    } browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    ${tunnelRoute ? '' : '// '}tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }`;
}

export function getNextjsConfigCjsTemplate(
  withSentryConfigOptionsTemplate: string,
): string {
  return `const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(
  nextConfig,
  ${withSentryConfigOptionsTemplate}
);
`;
}

export function getNextjsConfigMjsTemplate(
  withSentryConfigOptionsTemplate: string,
): string {
  return `import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(
  nextConfig,
  ${withSentryConfigOptionsTemplate}
);
`;
}

export function getNextjsConfigCjsAppendix(
  withSentryConfigOptionsTemplate: string,
): string {
  return `

// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  module.exports,
  ${withSentryConfigOptionsTemplate}
);
`;
}

export function getNextjsConfigEsmCopyPasteSnippet(
  withSentryConfigOptionsTemplate: string,
): string {
  return `

// next.config.mjs
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(
  yourNextConfig,
  ${withSentryConfigOptionsTemplate}
);
`;
}

function getClientIntegrationsSnippet(features: { replay: boolean }) {
  if (features.replay) {
    return `

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
  ],`;
  }

  return '';
}

export function getSentryServersideConfigContents(
  dsn: string,
  config: 'server' | 'edge',
  selectedFeaturesMap: {
    replay: boolean;
    performance: boolean;
  },
): string {
  let primer;
  if (config === 'server') {
    primer = `// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  } else if (config === 'edge') {
    primer = `// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  }

  let performanceOptions = '';
  if (selectedFeaturesMap.performance) {
    performanceOptions += `

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,`;
  }

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `${primer}

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "${dsn}",${performanceOptions}

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
`;
}

export function getInstrumentationClientFileContents(
  dsn: string,
  selectedFeaturesMap: {
    replay: boolean;
    performance: boolean;
  },
): string {
  const integrationsOptions = getClientIntegrationsSnippet({
    replay: selectedFeaturesMap.replay,
  });

  let replayOptions = '';

  if (selectedFeaturesMap.replay) {
    replayOptions += `

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,`;
  }

  let performanceOptions = '';
  if (selectedFeaturesMap.performance) {
    performanceOptions += `

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,`;
  }

  return `// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "${dsn}",${integrationsOptions}${performanceOptions}${replayOptions}

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;`;
}

export function getSentryExamplePageContents(options: {
  selfHosted: boolean;
  sentryUrl: string;
  orgSlug: string;
  projectId: string;
  useClient: boolean;
}): string {
  const issuesPageLink = options.selfHosted
    ? `${options.sentryUrl}organizations/${options.orgSlug}/issues/?project=${options.projectId}`
    : `https://${options.orgSlug}.sentry.io/issues/?project=${options.projectId}`;

  return `${
    options.useClient ? '"use client";\n\n' : ''
  }import Head from "next/head";
import * as Sentry from "@sentry/nextjs";
import { useState, useEffect } from "react";

class SentryExampleFrontendError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleFrontendError";
  }
}

export default function Page() {
  const [hasSentError, setHasSentError] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  
  useEffect(() => {
    async function checkConnectivity() {
      const result = await Sentry.diagnoseSdkConnectivity();
      setIsConnected(result !== 'sentry-unreachable');
    }
    checkConnectivity();
  }, []);

  return (
    <div>
      <Head>
        <title>sentry-example-page</title>
        <meta name="description" content="Test Sentry for your Next.js app!" />
      </Head>

      <main>
        <div className="flex-spacer" />
        <svg height="40" width="40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21.85 2.995a3.698 3.698 0 0 1 1.353 1.354l16.303 28.278a3.703 3.703 0 0 1-1.354 5.053 3.694 3.694 0 0 1-1.848.496h-3.828a31.149 31.149 0 0 0 0-3.09h3.815a.61.61 0 0 0 .537-.917L20.523 5.893a.61.61 0 0 0-1.057 0l-3.739 6.494a28.948 28.948 0 0 1 9.63 10.453 28.988 28.988 0 0 1 3.499 13.78v1.542h-9.852v-1.544a19.106 19.106 0 0 0-2.182-8.85 19.08 19.08 0 0 0-6.032-6.829l-1.85 3.208a15.377 15.377 0 0 1 6.382 12.484v1.542H3.696A3.694 3.694 0 0 1 0 34.473c0-.648.17-1.286.494-1.849l2.33-4.074a8.562 8.562 0 0 1 2.689 1.536L3.158 34.17a.611.611 0 0 0 .538.917h8.448a12.481 12.481 0 0 0-6.037-9.09l-1.344-.772 4.908-8.545 1.344.77a22.16 22.16 0 0 1 7.705 7.444 22.193 22.193 0 0 1 3.316 10.193h3.699a25.892 25.892 0 0 0-3.811-12.033 25.856 25.856 0 0 0-9.046-8.796l-1.344-.772 5.269-9.136a3.698 3.698 0 0 1 3.2-1.849c.648 0 1.285.17 1.847.495Z" fill="currentcolor"/>
        </svg>
        <h1>
          sentry-example-page
        </h1>

        <p className="description">
          Click the button below, and view the sample error on the Sentry <a target="_blank" href="${issuesPageLink}">Issues Page</a>.
          For more details about setting up Sentry, <a target="_blank" href="https://docs.sentry.io/platforms/javascript/guides/nextjs/">read our docs</a>.
        </p>

        <button
          type="button"
          onClick={async () => {
            await Sentry.startSpan({
              name: 'Example Frontend Span',
              op: 'test'
            }, async () => {
              const res = await fetch("/api/sentry-example-api");
              if (!res.ok) {
                setHasSentError(true);
                throw new SentryExampleFrontendError("This error is raised on the frontend of the example page.");
              }
            });
          }}
        >
          <span>
            Throw Sample Error
          </span>
        </button>

        {hasSentError ? (
          <p className="success">
            Sample error was sent to Sentry.
          </p>
        ) : !isConnected ? (
          <div className="connectivity-error">
            <p>The Sentry SDK is not able to reach Sentry right now - this may be due to an adblocker. For more information, see <a target="_blank" href="https://docs.sentry.io/platforms/javascript/guides/nextjs/troubleshooting/#the-sdk-is-not-sending-any-data">the troubleshooting guide</a>.</p>
          </div>
        ) : (
          <div className="success_placeholder" />
        )}

        <div className="flex-spacer" />
        
        <p className="description">
          Adblockers will prevent errors from being sent to Sentry.
        </p>
      </main>

      <style>{\`
        main {
          display: flex;
          min-height: 100vh;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 16px;
          padding: 16px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        }

        h1 {
          padding: 0px 4px;
          border-radius: 4px;
          background-color: rgba(24, 20, 35, 0.03);
          font-family: monospace;
          font-size: 20px;
          line-height: 1.2;
        }

        p {
          margin: 0;
          font-size: 20px;
        }

        a {
          color: #6341F0;
          text-decoration: underline;
          cursor: pointer;

          @media (prefers-color-scheme: dark) {
            color: #B3A1FF;
          }
        }

        button {
          border-radius: 8px;
          color: white;
          cursor: pointer;
          background-color: #553DB8;
          border: none;
          padding: 0;
          margin-top: 4px;

          & > span {
            display: inline-block;
            padding: 12px 16px;
            border-radius: inherit;
            font-size: 20px;
            font-weight: bold;
            line-height: 1;
            background-color: #7553FF;
            border: 1px solid #553DB8;
            transform: translateY(-4px);
          }

          &:hover > span {
            transform: translateY(-8px);
          }

          &:active > span {
            transform: translateY(0);
          }
        }

        .description {
          text-align: center;
          color: #6E6C75;
          max-width: 500px;
          line-height: 1.5;
          font-size: 20px;

          @media (prefers-color-scheme: dark) {
            color: #A49FB5;
          }
        }

        .flex-spacer {
          flex: 1;
        }

        .success {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 20px;
          line-height: 1;
          background-color: #00F261;
          border: 1px solid #00BF4D;
          color: #181423;
        }

        .success_placeholder {
          height: 46px;
        }

        .connectivity-error {
          padding: 12px 16px;
          background-color: #E50045;
          border-radius: 8px;
          width: 500px;
          color: #FFFFFF;
          border: 1px solid #A80033;
          text-align: center;
          margin: 0;
        }
        
        .connectivity-error a {
          color: #FFFFFF;
          text-decoration: underline;
        }
      \`}</style>
    </div>
  );
}
`;
}

export function getSentryExamplePagesDirApiRoute() {
  return `// Custom error class for Sentry testing
class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}
// A faulty API route to test Sentry's error monitoring
export default function handler(_req, res) {
throw new SentryExampleAPIError("This error is raised on the backend called by the example page.");
res.status(200).json({ name: "John Doe" });
}
`;
}

export function getSentryExampleAppDirApiRoute() {
  return `import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}
// A faulty API route to test Sentry's error monitoring
export function GET() {
  throw new SentryExampleAPIError("This error is raised on the backend called by the example page.");
  return NextResponse.json({ data: "Testing Sentry Error..." });
}
`;
}

export function getSentryDefaultUnderscoreErrorPage() {
  return `import * as Sentry from "@sentry/nextjs";
import Error from "next/error";

const CustomErrorComponent = (props) => {
  return <Error statusCode={props.statusCode} />;
};

CustomErrorComponent.getInitialProps = async (contextData) => {
  // In case this is running in a serverless function, await this in order to give Sentry
  // time to send the error before the lambda exits
  await Sentry.captureUnderscoreErrorException(contextData);

  // This will contain the status code of the response
  return Error.getInitialProps(contextData);
};

export default CustomErrorComponent;
`;
}

export function getSimpleUnderscoreErrorCopyPasteSnippet() {
  return `
${chalk.green(`import * as Sentry from '@sentry/nextjs';`)}
${chalk.green(`import Error from "next/error";`)}

${chalk.dim(
  '// Replace "YourCustomErrorComponent" with your custom error component!',
)}
YourCustomErrorComponent.getInitialProps = async (${chalk.green(
    'contextData',
  )}) => {
  ${chalk.green('await Sentry.captureUnderscoreErrorException(contextData);')}

  ${chalk.dim('// ...other getInitialProps code')}

  return Error.getInitialProps(contextData);
};
`;
}

export function getGenerateMetadataSnippet(isTs: boolean) {
  return makeCodeSnippet(true, (unchanged, plus) => {
    return plus(`
      import * as Sentry from '@sentry/nextjs';
      ${isTs ? `import type { Metadata } from 'next';` : ''}

      ${unchanged(
        '// Add or edit your "generateMetadata" to include the Sentry trace data:',
      )}
      export function generateMetadata()${isTs ? ': Metadata' : ''} {
        return {
          // ... your existing metadata
          other: {
            ...Sentry.getTraceData()
          }
        };
      }
`);
  });
}

export function getFullUnderscoreErrorCopyPasteSnippet(isTs: boolean) {
  return `
import * as Sentry from '@sentry/nextjs';${
    isTs ? '\nimport type { NextPageContext } from "next";' : ''
  }
import Error from "next/error";

${chalk.dim(
  '// Replace "YourCustomErrorComponent" with your custom error component!',
)}
YourCustomErrorComponent.getInitialProps = async (contextData${
    isTs ? ': NextPageContext' : ''
  }) => {
  await Sentry.captureUnderscoreErrorException(contextData);

  return Error.getInitialProps(contextData);
};
`;
}

export function getInstrumentationHookContent(
  instrumentationHookLocation: 'src' | 'root',
) {
  return `import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
`;
}

export function getInstrumentationHookCopyPasteSnippet(
  instrumentationHookLocation: 'src' | 'root',
) {
  return makeCodeSnippet(true, (unchanged, plus) => {
    return unchanged(`${plus("import * as Sentry from '@sentry/nextjs';")}

export ${plus('async')} function register() {
  ${plus(`if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.edge.config');
  }`)}
}

${plus('export const onRequestError = Sentry.captureRequestError;')}
`);
  });
}

export function getInstrumentationClientHookCopyPasteSnippet(
  dsn: string,
  selectedFeaturesMap: {
    replay: boolean;
    performance: boolean;
  },
) {
  return makeCodeSnippet(true, (unchanged, plus) => {
    return plus(getInstrumentationClientFileContents(dsn, selectedFeaturesMap));
  });
}

export function getSentryDefaultGlobalErrorPage(isTs: boolean) {
  return isTs
    ? `"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* \`NextError\` is the default Next.js error page component. Its type
        definition requires a \`statusCode\` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}`
    : `"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* \`NextError\` is the default Next.js error page component. Its type
        definition requires a \`statusCode\` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
`;
}

export function getGlobalErrorCopyPasteSnippet(isTs: boolean) {
  if (isTs) {
    return `"use client";

${chalk.green('import * as Sentry from "@sentry/nextjs";')}
${chalk.green('import Error from "next/error";')}
${chalk.green('import { useEffect } from "react";')}

export default function GlobalError(${chalk.green(
      '{ error }: { error: Error }',
    )}) {
  ${chalk.green(`useEffect(() => {
    Sentry.captureException(error);
  }, [error]);`)}

  return (
    <html>
      <body>
        {/* Your Error component here... */}
      </body>
    </html>
  );
}
`;
  }
  return `"use client";

${chalk.green('import * as Sentry from "@sentry/nextjs";')}
${chalk.green('import Error from "next/error";')}
${chalk.green('import { useEffect } from "react";')}

export default function GlobalError(${chalk.green('{ error }')}) {
  ${chalk.green(`useEffect(() => {
    Sentry.captureException(error);
  }, [error]);`)}

  return (
    <html>
      <body>
        {/* Your Error component here... */}
      </body>
    </html>
  );
}
`;
}

export const getRootLayout = (
  isTs: boolean,
) => `// This file was generated by the Sentry wizard because we couldn't find a root layout file.
// You can delete this file at any time.

export const metadata = {
  title: 'Sentry NextJS Example',
  description: 'Generated by Sentry',
}

export default function RootLayout({
  children,
}${
  isTs
    ? `: {
  children: React.ReactNode
}`
    : ''
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`;

export const getRootLayoutWithGenerateMetadata = (
  isTs: boolean,
) => `// This file was generated by the Sentry wizard because we couldn't find a root layout file.
import * as Sentry from '@sentry/nextjs';
${isTs ? 'import type { Metadata } from "next";' : ''}

export function generateMetadata()${isTs ? ': Metadata' : ''} {
  return {
    other: {
      ...Sentry.getTraceData(),
    }
  }
};
`;
