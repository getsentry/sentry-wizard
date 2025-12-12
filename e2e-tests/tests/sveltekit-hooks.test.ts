import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  TEST_ARGS,
  checkEnvBuildPlugin,
  checkFileContents,
  checkFileExists,
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
  cleanupGit,
  createFile,
  getWizardCommand,
  initGit,
  revertLocalChanges,
} from '../utils';
import { afterAll, beforeAll, describe, test } from 'vitest';
//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

const SERVER_HOOK_TEMPLATE = `import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/custom')) {
		return new Response('custom response');
	}

	const response = await resolve(event);
	return response;
};
`;
const CLIENT_HOOK_TEMPLATE = `
export async function handleError({ error, event }) {
  // you can capture the \`error\` and \`event\` from the client
  // but it only runs if the unexpected error comes from \`+ page.ts\`
  console.log(error)

  return {
    // don't show sensitive data to the user
    message: 'Yikes! 💩',
  }
}
`;

describe.sequential('Sveltekit', () => {
  describe('without existing hooks', () => {
    const integration = Integration.sveltekit;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/sveltekit-hooks-test-app',
    );

    beforeAll(async () => {
      initGit(projectDir);
      revertLocalChanges(projectDir);

      await runWizardOnSvelteKitProject(projectDir, integration);
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkSvelteKitProject(projectDir, integration);

    test('hooks.client.ts contains sentry', () => {
      checkFileContents(path.resolve(projectDir, 'src/hooks.client.ts'), [
        `import * as Sentry from '@sentry/sveltekit';`,
        `Sentry.init({
  dsn: '${TEST_ARGS.PROJECT_DSN}',

  tracesSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // If you don't want to use Session Replay, just remove the line below:
  integrations: [replayIntegration()],

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});`,
        'export const handleError = handleErrorWithSentry(',
      ]);
    });

    test('hooks.server.ts contains sentry', () => {
      checkFileContents(path.resolve(projectDir, 'src/hooks.server.ts'), [
        `import * as Sentry from '@sentry/sveltekit';`,
        `Sentry.init({
  dsn: '${TEST_ARGS.PROJECT_DSN}',

  tracesSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,


  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: import.meta.env.DEV,
});`,
        'export const handleError = handleErrorWithSentry();',
      ]);
    });

    test('creates an example route and page', () => {
      checkFileExists(
        path.resolve(projectDir, 'src/routes/sentry-example-page/+page.svelte'),
      );
      checkFileContents(
        path.resolve(projectDir, 'src/routes/sentry-example-page/+page.svelte'),
        // Svelte <5 specific syntax
        ['let hasSentError = false;', 'on:click={getSentryData}'],
      );
      checkFileExists(
        path.resolve(projectDir, 'src/routes/sentry-example-page/+server.js'),
      );
    });
  });

  describe('with existing hooks', () => {
    const integration = Integration.sveltekit;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/sveltekit-hooks-test-app',
    );

    beforeAll(async () => {
      initGit(projectDir);
      revertLocalChanges(projectDir);

      await runWizardOnSvelteKitProject(
        projectDir,
        integration,
        (projectDir) => {
          createFile(
            path.resolve(projectDir, 'src/hooks.server.ts'),
            SERVER_HOOK_TEMPLATE,
          );

          createFile(
            path.resolve(projectDir, 'src/hooks.client.ts'),
            CLIENT_HOOK_TEMPLATE,
          );
        },
      );
    });

    afterAll(() => {
      revertLocalChanges(projectDir);
      cleanupGit(projectDir);
    });

    checkSvelteKitProject(projectDir, integration);

    // These are removed from the common tests as the content is different
    // when the hooks are merged instead of created from the template
    test('hooks.client.ts contains sentry instrumentation', () => {
      checkFileContents(path.resolve(projectDir, 'src/hooks.client.ts'), [
        `import * as Sentry from '@sentry/sveltekit';`,
        `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.replayIntegration()],
    enableLogs: true,
    sendDefaultPii: true
})`,
        'export const handleError = Sentry.handleErrorWithSentry(',
      ]);
    });

    test('hooks.server.ts contains sentry init', () => {
      checkFileContents(path.resolve(projectDir, 'src/hooks.server.ts'), [
        `import * as Sentry from '@sentry/sveltekit';`,
        `Sentry.init({
    dsn: "${TEST_ARGS.PROJECT_DSN}",
    tracesSampleRate: 1,
    enableLogs: true,
    sendDefaultPii: true
})`,
        'export const handleError = Sentry.handleErrorWithSentry();',
      ]);
    });
  });
});

async function runWizardOnSvelteKitProject(
  projectDir: string,
  integration: Integration,
  fileModificationFn?: (
    projectDir: string,
    integration: Integration,
  ) => unknown,
) {
  const wizardInteraction = withEnv({
    cwd: projectDir,
  }).defineInteraction();

  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);

    wizardInteraction
      .whenAsked('Do you want to continue anyway?')
      .respondWith(KEYS.ENTER);
  }

  wizardInteraction
    .whenAsked("It seems you're using a SvelteKit version")
    .respondWith(KEYS.DOWN, KEYS.DOWN, KEYS.ENTER)
    .whenAsked('Please select your package manager.')
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .whenAsked('Do you want to enable Tracing', {
      timeout: 90_000, // package installation can take a while in CI
    })
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to enable Session Replay')
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to enable Logs')
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to create an example page')
    .respondWith(KEYS.ENTER)
    .whenAsked(
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
    )
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .expectOutput('Successfully installed the Sentry SvelteKit SDK!');

  await wizardInteraction.run(getWizardCommand(Integration.sveltekit));
}

function checkSvelteKitProject(
  projectDir: string,
  integration: Integration,
  options?: {
    devModeExpectedOutput: string;
    prodModeExpectedOutput: string;
  },
) {
  test('should have the correct package.json', () => {
    checkPackageJson(projectDir, integration);
  });

  test('should have the correct .env.sentry-build-plugin', () => {
    checkEnvBuildPlugin(projectDir);
  });

  test('vite.config contains sentry plugin', () => {
    checkFileContents(
      path.resolve(projectDir, 'vite.config.ts'),
      `plugins: [sentrySvelteKit({`,
    );
  });

  test('hook files created', () => {
    checkFileExists(path.resolve(projectDir, 'src/hooks.server.ts'));
    checkFileExists(path.resolve(projectDir, 'src/hooks.client.ts'));
  });

  test('builds successfully', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(
      projectDir,
      options?.devModeExpectedOutput || 'ready in',
    );
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(
      projectDir,
      options?.prodModeExpectedOutput || 'to expose',
      'preview',
    );
  });
}
