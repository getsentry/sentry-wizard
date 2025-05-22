import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkSentryCliRc,
  cleanupGit,
  getWizardCommand,
  initGit,
  revertLocalChanges,
  TEST_ARGS,
} from '../utils';
import { Integration } from '../../lib/Constants';
import * as path from 'path';
import fs from 'fs';
//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';
import { PackageDotJson } from '../../src/utils/package-json';

describe('Cloudflare-Wrangler-Sourcemaps-Wizard', () => {
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/cloudflare-wrangler-sourcemaps-test-app',
  );

  let wizardExitCode: number;

  beforeAll(async () => {
    initGit(projectDir);
    revertLocalChanges(projectDir);

    wizardExitCode = await withEnv({ cwd: projectDir, debug: false })
      .defineInteraction()
      .step('intro', ({ expectOutput }) => {
        expectOutput('This wizard will help you upload source maps to Sentry');
      })
      .step('select wrangler', ({ expectOutput, whenAsked }) => {
        whenAsked(
          'Which framework, bundler or build tool are you using?',
        ).respondWith(KEYS.ENTER);

        expectOutput('Before we get started');
        expectOutput('We recommend using Vite to build your worker instead');
        whenAsked('want to proceed with the Wrangler setup').respondWith(
          KEYS.ENTER,
        );
      })
      .step('configure source maps upload', ({ expectOutput, whenAsked }) => {
        expectOutput('Installing @sentry/cli');
        whenAsked('Is yarn deploy your build and deploy command?').respondWith(
          KEYS.ENTER,
        );
        expectOutput('Added a sentry:sourcemaps script to your package.json');
        expectOutput('Added a postdeploy script to your package.json');
        expectOutput(
          'Modified your deploy script to enable uploading source maps',
        );
        expectOutput(
          'Added auth token to .sentryclirc for you to test uploading source maps locally',
        );
        expectOutput('Created .sentryclirc');
      })
      .step('add auth token to CI/CD (skipped)', ({ whenAsked }) => {
        whenAsked(
          'Are you using a CI/CD tool to build and deploy your application?',
        ).respondWith(KEYS.DOWN, KEYS.ENTER, KEYS.ENTER); // no
      })
      .expectOutput("That's it")
      .run(getWizardCommand(Integration.sourcemaps));
  }, 60_000);

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  it('exits with exit code 0', () => {
    expect(wizardExitCode).toBe(0);
  });

  it('adds and adjusts the respective package.json scripts', () => {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
    ) as PackageDotJson;

    expect(pkgJson?.scripts?.['sentry:sourcemaps']).toEqual(
      `_SENTRY_RELEASE=$(sentry-cli releases propose-version) && sentry-cli releases new $_SENTRY_RELEASE --org=${TEST_ARGS.ORG_SLUG} --project=${TEST_ARGS.PROJECT_SLUG} && sentry-cli sourcemaps upload --org=${TEST_ARGS.ORG_SLUG} --project=${TEST_ARGS.PROJECT_SLUG} --release=$_SENTRY_RELEASE --strip-prefix 'dist/..' dist`,
    );
    expect(pkgJson?.scripts?.['postdeploy']).toEqual('yarn sentry:sourcemaps');
    expect(pkgJson?.scripts?.['deploy']).toEqual(
      'wrangler deploy --outdir dist --upload-source-maps --var SENTRY_RELEASE:$(sentry-cli releases propose-version)',
    );
  });

  it('adds sentry-cli as a devDependency', () => {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
    ) as PackageDotJson;

    expect(pkgJson?.devDependencies?.['@sentry/cli']).toBeDefined();
  });

  it('adds a .sentryclirc file', () => {
    checkSentryCliRc(projectDir);
  });
});
