import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupGit, initGit, revertLocalChanges, TEST_ARGS } from '../utils';
import { Integration } from '../../lib/Constants';
import * as path from 'path';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';

describe('Cloudflare Wrangler Sourcemaps Wizard', () => {
  const integration = Integration.sourcemaps;
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/cloudflare-wrangler-sourcemaps-test-app',
  );

  console.log('projectDir', projectDir);

  let wizardExitCode: number;

  beforeAll(async () => {
    initGit(projectDir);
    revertLocalChanges(projectDir);

    const binName = process.env.SENTRY_WIZARD_E2E_TEST_BIN
      ? ['dist-bin', `sentry-wizard-${process.platform}-${process.arch}`]
      : ['dist', 'bin.js'];
    const binPath = path.join(__dirname, '..', '..', ...binName);

    const args = [
      '--debug',
      '-i',
      integration,
      '--preSelectedProject.authToken',
      TEST_ARGS.AUTH_TOKEN,
      '--preSelectedProject.dsn',
      TEST_ARGS.PROJECT_DSN,
      '--preSelectedProject.orgSlug',
      TEST_ARGS.ORG_SLUG,
      '--preSelectedProject.projectSlug',
      TEST_ARGS.PROJECT_SLUG,
      '--disable-telemetry',
    ];

    wizardExitCode = await withEnv({ cwd: projectDir, debug: true })
      .defineInteraction()
      .expectOutput('This wizard will help you upload source maps to Sentry')
      .whenAsked('Which framework, bundler or build tool are you using?')
      .respondWith(KEYS.ENTER)
      .expectOutput('Before we get started')
      .expectOutput('We recommend using Vite to build your worker instead')
      .whenAsked('Do you want to proceed with the Wrangler setup')
      .respondWith(KEYS.ENTER)
      .expectOutput('Installing @sentry/cli')
      .whenAsked('Is yarn deploy your build and deploy command?')
      .respondWith(KEYS.ENTER)
      .expectOutput('Added a sentry:sourcemaps script to your package.json')
      .expectOutput('Added a postdeploy script to your package.json')
      .expectOutput(
        'Modified your deploy script to enable uploading source maps',
      )
      .expectOutput(
        'Added auth token to .sentryclirc for you to test uploading source maps locally',
      )
      .expectOutput('Created .sentryclirc')
      .whenAsked(
        'Are you using a CI/CD tool to build and deploy your application?',
      )
      .respondWith(KEYS.DOWN, KEYS.ENTER) // no
      .expectOutput("That's it - everything is set up!")
      .run(`${binPath} ${args.join(' ')}`);

    console.log('wizardExitCode', wizardExitCode);
  }, 60_000);

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  it('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });
});
