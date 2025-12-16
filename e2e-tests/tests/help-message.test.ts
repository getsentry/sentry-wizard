import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('--help command', () => {
  it('prints the up to date help command', () => {
    const binName = process.env.SENTRY_WIZARD_E2E_TEST_BIN
      ? ['dist-bin', `sentry-wizard-${process.platform}-${process.arch}`]
      : ['dist', 'bin.js'];

    const binPath = join(__dirname, '..', '..', ...binName);

    const output = execSync(`${binPath} --help`, {
      stdio: 'pipe',
    });

    expect(output.toString()).toMatchInlineSnapshot(`
      "Options:
            --help                Show help                                  [boolean]
            --debug               Enable verbose logging
                                  env: SENTRY_WIZARD_DEBUG  [boolean] [default: false]
            --uninstall           Revert project setup process
                                  env: SENTRY_WIZARD_UNINSTALL
                                                            [boolean] [default: false]
            --skip-connect        Skips the connection to the server
                                  env: SENTRY_WIZARD_SKIP_CONNECT
                                                            [boolean] [default: false]
            --quiet               Do not fallback to prompting user asking questions
                                  env: SENTRY_WIZARD_QUIET  [boolean] [default: false]
        -i, --integration         Choose the integration to setup
                                  env: SENTRY_WIZARD_INTEGRATION
           [choices: "reactNative", "flutter", "ios", "android", "cordova", "angular",
                    "electron", "nextjs", "nuxt", "remix", "reactRouter", "sveltekit",
                                                           "sourcemaps", "cloudflare"]
        -p, --platform            Choose platform(s)
                                  env: SENTRY_WIZARD_PLATFORM
                                                   [array] [choices: "ios", "android"]
        -u, --url                 The url to your Sentry installation
                                  env: SENTRY_WIZARD_URL
            --project             The Sentry project slug to use
                                       [string] [default: Select project during setup]
            --org                 The Sentry org slug to use
                                           [string] [default: Select org during setup]
            --saas                Skip the self-hosted or SaaS URL selection process
                          [boolean] [default: Select self-hosted or SaaS during setup]
        -s, --signup              Redirect to signup page if not logged in
                                                            [boolean] [default: false]
            --disable-telemetry   Don't send telemetry data to Sentry
                                                            [boolean] [default: false]
            --force-install       Force install the SDK NPM package
                                                            [boolean] [default: false]
            --ignore-git-changes  Ignore git changes in the project
                                                            [boolean] [default: false]
            --spotlight           Enable Spotlight for local development. This does
                                  not require a Sentry account or project.
                                                            [boolean] [default: false]
            --version             Show version number                        [boolean]
      "
    `);
  });
});
