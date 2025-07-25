import chalk from 'chalk';
import { makeCodeSnippet } from '../utils/clack';
import { NextjsTemplateLoader, TemplateVariables } from './template-loader';

type WithSentryConfigOptions = {
  orgSlug: string;
  projectSlug: string;
  selfHosted: boolean;
  sentryUrl: string;
  tunnelRoute: boolean;
};

const templateLoader = new NextjsTemplateLoader();

export function getWithSentryConfigOptionsTemplate({
  orgSlug,
  projectSlug,
  selfHosted,
  tunnelRoute,
  sentryUrl,
}: WithSentryConfigOptions): string {
  const variables: Partial<TemplateVariables> = {
    ORG_SLUG: orgSlug,
    PROJECT_ID: projectSlug,
    TUNNEL_ROUTE_COMMENT: tunnelRoute ? 'Route' : 'Uncomment to route',
    TUNNEL_ROUTE_CONFIG: tunnelRoute ? '' : '// ',
  };

  if (selfHosted) {
    variables.SENTRY_URL = `\n    sentryUrl: "${sentryUrl}",`;
  }

  return templateLoader.getWithSentryConfigOptions(variables);
}

export function getNextjsConfigCjsTemplate(
  withSentryConfigOptionsTemplate: string,
): string {
  const variables = {
    WITH_SENTRY_CONFIG_OPTIONS: withSentryConfigOptionsTemplate,
  };

  return templateLoader.getNextjsConfig('cjs', variables);
}

export function getNextjsConfigMjsTemplate(
  withSentryConfigOptionsTemplate: string,
): string {
  const variables = {
    WITH_SENTRY_CONFIG_OPTIONS: withSentryConfigOptionsTemplate,
  };

  return templateLoader.getNextjsConfig('mjs', variables);
}

export function getNextjsConfigCjsAppendix(
  withSentryConfigOptionsTemplate: string,
): string {
  const variables = {
    WITH_SENTRY_CONFIG_OPTIONS: withSentryConfigOptionsTemplate,
  };

  return templateLoader.getNextjsConfig('cjs-appendix', variables);
}

export function getNextjsConfigEsmCopyPasteSnippet(
  withSentryConfigOptionsTemplate: string,
): string {
  const variables = {
    WITH_SENTRY_CONFIG_OPTIONS: withSentryConfigOptionsTemplate,
  };

  return templateLoader.getNextjsConfig('esm-snippet', variables);
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
  let performanceOptions = '';
  if (selectedFeaturesMap.performance) {
    performanceOptions = `

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,`;
  }

  const variables = {
    DSN: dsn,
    PERFORMANCE_OPTIONS: performanceOptions,
    REPLAY_OPTIONS: '',
  };

  if (config === 'server') {
    return templateLoader.getSentryServerConfig(true, variables);
  } else {
    return templateLoader.getSentryEdgeConfig(true, variables);
  }
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

  const variables = {
    DSN: dsn,
    PERFORMANCE_OPTIONS: performanceOptions,
    INTEGRATIONS_OPTIONS: integrationsOptions,
    REPLAY_OPTIONS: replayOptions,
  };

  return templateLoader.getInstrumentationClient(true, variables);
}

export function getSentrySimpleExamplePageContents(options: {
  selfHosted: boolean;
  sentryUrl: string;
  orgSlug: string;
  projectId: string;
  useClient: boolean;
  isTypeScript?: boolean;
}): string {
  const issuesPageLink = options.selfHosted
    ? `${options.sentryUrl}organizations/${options.orgSlug}/issues/?project=${options.projectId}`
    : `https://${options.orgSlug}.sentry.io/issues/?project=${options.projectId}`;

  const variables = {
    ORG_SLUG: options.orgSlug,
    PROJECT_ID: options.projectId,
    SENTRY_URL: options.sentryUrl,
    USE_CLIENT: options.useClient ? '"use client";\n\n' : '',
    ISSUES_PAGE_LINK: issuesPageLink,
  };

  return templateLoader.getSimpleExamplePage(
    options.isTypeScript || false,
    true,
    variables,
  );
}

export function getSentryExamplePagesDirApiRoute({
  isTypeScript,
}: {
  isTypeScript: boolean;
}) {
  return templateLoader.getExampleApiRoute(false, isTypeScript, {});
}

export function getSentryExampleAppDirApiRoute({
  isTypeScript,
}: {
  isTypeScript: boolean;
}) {
  return templateLoader.getExampleApiRoute(true, isTypeScript, {});
}

export function getSentryDefaultUnderscoreErrorPage() {
  return templateLoader.getErrorPage('underscore-error', false, {});
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
      import * as Sentry from '@sentry/nextjs';\n${
        isTs ? `      import type { Metadata } from 'next';\n` : ''
      }
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
  const importPath = instrumentationHookLocation === 'root' ? '.' : '..';

  const variables = {
    IMPORT_PATH: importPath,
  };

  return templateLoader.getInstrumentationHook(true, variables);
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
  return templateLoader.getErrorPage('global-error', isTs, {});
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

export const getRootLayout = (isTs: boolean) => {
  return templateLoader.getRootLayout(false, isTs, {});
};

export const getRootLayoutWithGenerateMetadata = (isTs: boolean) => {
  return templateLoader.getRootLayout(true, isTs, {});
};

