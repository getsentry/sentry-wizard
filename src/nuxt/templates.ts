import { getIssueStreamUrl } from '../utils/url';

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

export function getNuxtModuleFallbackTemplate(
  options: {
    org: string;
    project: string;
    url: string;
    selfHosted: boolean;
  },
  shouldTopLevelImport: boolean,
): string {
  return `  modules: ["@sentry/nuxt/module"],
  sentry: {
    sourceMapsUploadOptions: {
      org: "${options.org}",
      project: "${options.project}",${
    options.selfHosted ? `\n      url: "${options.url}",` : ''
  }
    },${
      shouldTopLevelImport
        ? `\n    autoInjectServerSentry: "top-level-import",`
        : ''
    }
  },
  sourcemap: { client: "hidden" },`;
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

const featuresConfigMap: Record<keyof SelectedSentryFeatures, string> = {
  performance: [
    '  // We recommend adjusting this value in production, or using tracesSampler',
    '  // for finer control',
    '  tracesSampleRate: 1.0,',
  ].join('\n'),
  replay: [
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
  ].join('\n'),
};

const featuresMap: Record<
  'client' | 'server',
  Array<keyof SelectedSentryFeatures>
> = {
  client: ['performance', 'replay'],
  server: ['performance'],
};

export function getConfigBody(
  dsn: string,
  variant: 'client' | 'server',
  selectedFeatures: SelectedSentryFeatures,
) {
  return [
    `dsn: "${dsn}",`,
    Object.entries(selectedFeatures)
      .map(([feature, activated]: [keyof SelectedSentryFeatures, boolean]) => {
        return featuresMap[variant].includes(feature) && activated
          ? featuresConfigMap[feature]
          : null;
      })
      .filter(Boolean)
      .join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function getSentryClientConfigContents(
  dsn: string,
  selectedFeatures: SelectedSentryFeatures,
): string {
  return `import * as Sentry from "@sentry/nuxt";

Sentry.init({
  // If set up, you can use your runtime config here
  // dsn: useRuntimeConfig().public.sentry.dsn,
  ${getConfigBody(dsn, 'client', selectedFeatures)}
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
`;
}

function getSentryServerConfigContents(
  dsn: string,
  selectedFeatures: SelectedSentryFeatures,
): string {
  return `import * as Sentry from "@sentry/nuxt";
 
Sentry.init({
  ${getConfigBody(dsn, 'server', selectedFeatures)}
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
`;
}

export function getIndexRouteTemplate(): string {
  return `<!--
This is just to verify the sentry-example-page.
Feel free to delete this file.
-->

<template></template>`;
}

export function getSentryExamplePageTemplate(options: {
  url: string;
  org: string;
  projectId: string;
}): string {
  const { url, org, projectId } = options;
  const issuesPageLink = getIssueStreamUrl({ url, orgSlug: org, projectId });

  return `<!--
This is just a very simple page with a button to throw an example error.
Feel free to delete this file.
-->

<script setup>
  import * as Sentry from '@sentry/nuxt';
  import { useFetch} from '#imports'
  
  function getSentryData() {
    Sentry.startSpan(
      {
        name: 'Example Frontend Span',
        op: 'test'
      },
      async () => {
        const { error } = await useFetch('/api/sentry-example-api');
        if (error.value) {
          throw new Error('Sentry Example Frontend Error');
        }
      }
    )
  }
</script>

<template>
  <title>Sentry Onboarding</title>
  <div>
  <main>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 44">
      <path
        fill="currentColor"
        d="M124.32,28.28,109.56,9.22h-3.68V34.77h3.73V15.19l15.18,19.58h3.26V9.22h-3.73ZM87.15,23.54h13.23V20.22H87.14V12.53h14.93V9.21H83.34V34.77h18.92V31.45H87.14ZM71.59,20.3h0C66.44,19.06,65,18.08,65,15.7c0-2.14,1.89-3.59,4.71-3.59a12.06,12.06,0,0,1,7.07,2.55l2-2.83a14.1,14.1,0,0,0-9-3c-5.06,0-8.59,3-8.59,7.27,0,4.6,3,6.19,8.46,7.52C74.51,24.74,76,25.78,76,28.11s-2,3.77-5.09,3.77a12.34,12.34,0,0,1-8.3-3.26l-2.25,2.69a15.94,15.94,0,0,0,10.42,3.85c5.48,0,9-2.95,9-7.51C79.75,23.79,77.47,21.72,71.59,20.3ZM195.7,9.22l-7.69,12-7.64-12h-4.46L186,24.67V34.78h3.84V24.55L200,9.22Zm-64.63,3.46h8.37v22.1h3.84V12.68h8.37V9.22H131.08ZM169.41,24.8c3.86-1.07,6-3.77,6-7.63,0-4.91-3.59-8-9.38-8H154.67V34.76h3.8V25.58h6.45l6.48,9.2h4.44l-7-9.82Zm-10.95-2.5V12.6h7.17c3.74,0,5.88,1.77,5.88,4.84s-2.29,4.86-5.84,4.86Z M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43a4.49,4.49,0,0,0-.62-2.28Z"
      />
    </svg>
    <p>
      Get Started with this <strong>simple Example:</strong>
    </p>

    <p>1. Send us a sample error:</p>
    <button type="button" @click="getSentryData"> Throw error! </button>

    <p>
      2. Look for the error on the
      <a href="${issuesPageLink}">Issues Page</a>.
    </p>
    <p style="margin-top: 24px;">
      For more information, take a look at the
      <a href="https://docs.sentry.io/platforms/javascript/guides/nuxt/">
        Sentry Nuxt Documentation
      </a>
    </p>
  </main>
</div>
</template>

<style scoped>
  main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  svg {
    font-size: 4rem;
    margin: 14px 0;
    height: 1em;
  }

  button {
    padding: 12px;
    cursor: pointer;
    background-color: rgb(54, 45, 89);
    border-radius: 4px;
    border: none;
    color: white;
    font-size: 1em;
    margin: 1em;
    transition: all 0.25s ease-in-out;
  }
  button:hover {
    background-color: #8c5393;
    box-shadow: 4px;
    box-shadow: 0px 0px 15px 2px rgba(140, 83, 147, 0.5);
  }
  button:active {
    background-color: #c73852;
  }
</style>
`;
}

export function getSentryExampleApiTemplate() {
  return `// This is just a very simple API route that throws an example error.
// Feel free to delete this file.
import { defineEventHandler } from '#imports';

export default defineEventHandler(() => {
  throw new Error("Sentry Example API Route Error");
});
`;
}

export function getSentryErrorButtonTemplate() {
  return `<!--
This is just a very simple component that throws an example error.
Feel free to delete this file.
-->

<script setup>
  import * as Sentry from '@sentry/nuxt';
  
  const throwError = () => {
    Sentry.startSpan(
      {
        name: 'Example Frontend Span',
        op: 'test'
      },
      () => {
        throw new Error('Sentry Example Error');
      }
    )
  };
</script>

<template>
  <button id="errorBtn" @click="throwError"> Throw Error! </button>
</template>

<style scoped>
  button {
    padding: 12px;
    cursor: pointer;
    background-color: rgb(54, 45, 89);
    border-radius: 4px;
    border: none;
    color: white;
    font-size: 1em;
    margin: 1em;
    transition: all 0.25s ease-in-out;
  }
  button:hover {
    background-color: #8c5393;
    box-shadow: 4px;
    box-shadow: 0px 0px 15px 2px rgba(140, 83, 147, 0.5);
  }
  button:active {
    background-color: #c73852;
  }
</style>
`;
}
