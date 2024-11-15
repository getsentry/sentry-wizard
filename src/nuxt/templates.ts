type SelectedSentryFeatures = {
  performance: boolean;
  replay: boolean;
};

export function getDefaultNuxtConfig(): string {
  return `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true }
})
`;
}

export function getSentryConfigContents(
  dsn: string,
  config: 'client' | 'server',
  selectedFeatures: SelectedSentryFeatures,
): string {
  if (config === 'client') {
    return getSentryClientConfigContents(dsn, selectedFeatures);
  }

  return getSentryServerConfigContents(dsn, selectedFeatures);
}

const performanceConfig = [
  '',
  '  // We recommend adjusting this value in production, or using tracesSampler',
  '  // for finer control',
  '  tracesSampleRate: 1.0,',
];

const replayConfig = [
  '',
  '  // This sets the sample rate to be 10%. You may want this to be 100% while',
  '  // in development and sample at a lower rate in production',
  '  replaysSessionSampleRate: 0.1,',
  '  ',
  '  // If the entire session is not sampled, use the below sample rate to sample',
  '  // sessions when an error occurs.',
  '  replaysOnErrorSampleRate: 1.0,',
  '  ',
  "  // If you don't want to use Session Replay, just remove the line below:",
  '  integrations: [Sentry.replayIntegration()],',
];

function getSentryClientConfigContents(
  dsn: string,
  selectedFeatures: SelectedSentryFeatures,
): string {
  return `import * as Sentry from "@sentry/nuxt";

Sentry.init({
  // If set up, you can use your runtime config here
  // dsn: useRuntimeConfig().public.sentry.dsn,
  dsn: "${dsn}",
  ${selectedFeatures.performance ? performanceConfig.join('\n') : ''}${
    selectedFeatures.performance && selectedFeatures.replay ? '  ' : ''
  }${selectedFeatures.replay ? replayConfig.join('\n') : ''}
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
`;
}

function getSentryServerConfigContents(
  dsn: string,
  selectedFeatures: Omit<SelectedSentryFeatures, 'replay'>,
): string {
  return `import * as Sentry from "@sentry/nuxt";
 
Sentry.init({  
  dsn: "${dsn}",
  ${selectedFeatures.performance ? performanceConfig.join('\n') : ''}
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
`;
}
