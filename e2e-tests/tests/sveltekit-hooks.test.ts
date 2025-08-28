import * as path from 'node:path';
import { Integration } from '../../lib/Constants';
import {
  KEYS,
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
  revertLocalChanges,
  startWizardInstance,
} from '../utils';
import { afterAll, beforeAll, describe, test } from 'vitest';

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

async function runWizardOnSvelteKitProject(
  projectDir: string,
  integration: Integration,
  fileModificationFn?: (
    projectDir: string,
    integration: Integration,
  ) => unknown,
) {
  const wizardInstance = startWizardInstance(integration, projectDir);
  let kitVersionPrompted = false;

  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);

    // As we modified project, we have a warning prompt before we get the package manager prompt
    await wizardInstance.waitForOutput('Do you want to continue anyway?');

    kitVersionPrompted = await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      "It seems you're using a SvelteKit version",
    );
  } else {
    kitVersionPrompted = await wizardInstance.waitForOutput(
      "It seems you're using a SvelteKit version",
    );
  }

  const packageManagerPrompted =
    kitVersionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      // Select "Yes, Continue" to perform hooks-based SDK setup
      [KEYS.DOWN, KEYS.DOWN, KEYS.ENTER],
      'Please select your package manager.',
    ));

  const tracingOptionPrompted =
    packageManagerPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      // Selecting `yarn` as the package manager
      [KEYS.DOWN, KEYS.ENTER],
      // "Do you want to enable Tracing", sometimes doesn't work as `Tracing` can be printed in bold.
      'to track the performance of your application?',
      {
        timeout: 240_000,
      },
    ));

  const replayOptionPrompted =
    tracingOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      // "Do you want to enable Sentry Session Replay", sometimes doesn't work as `Sentry Session Replay` can be printed in bold.
      'to get a video-like reproduction of errors during a user session?',
    ));

  const logsOptionPrompted =
    replayOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      // "Do you want to enable Logs", sometimes doesn't work as `Logs` can be printed in bold.
      'to send your application logs to Sentry?',
    ));

  const examplePagePrompted =
    logsOptionPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Do you want to create an example page',
      {
        optional: true,
      },
    ));

  // After the example page prompt, we send ENTER to accept it
  // Then handle the MCP prompt that comes after
  const mcpPrompted =
    examplePagePrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER], // This ENTER is for accepting the example page
      'Optionally add a project-scoped MCP server configuration for the Sentry MCP?',
      {
        optional: true,
      },
    ));

  // Decline MCP config (default is Yes, so press DOWN then ENTER to select No)
  if (mcpPrompted) {
    await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'Successfully installed the Sentry SvelteKit SDK!',
    );
  } else {
    // If MCP wasn't prompted, wait for success message directly
    await wizardInstance.waitForOutput(
      'Successfully installed the Sentry SvelteKit SDK!',
    );
  }

  wizardInstance.kill();
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

  test('example page exists', () => {
    checkFileExists(
      path.resolve(projectDir, 'src/routes/sentry-example-page/+page.svelte'),
    );
    checkFileExists(
      path.resolve(projectDir, 'src/routes/sentry-example-page/+server.js'),
    );
  });

  test('vite.config contains sentry plugin', () => {
    checkFileContents(
      path.resolve(projectDir, 'vite.config.ts'),
      `plugins: [sentrySvelteKit({
        sourceMapsUploadOptions: {
`,
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

describe('Sveltekit', () => {
  describe('without existing hooks', () => {
    const integration = Integration.sveltekit;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/sveltekit-hooks-test-app',
    );

    beforeAll(async () => {
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

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: import.meta.env.DEV,
});`,
        'export const handleError = handleErrorWithSentry();',
      ]);
    });
  });

  describe('with existing hooks', () => {
    const integration = Integration.sveltekit;
    const projectDir = path.resolve(
      __dirname,
      '../test-applications/sveltekit-hooks-test-app',
    );

    beforeAll(async () => {
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
    enableLogs: true
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
    enableLogs: true
})`,
        'export const handleError = Sentry.handleErrorWithSentry();',
      ]);
    });
  });
});
