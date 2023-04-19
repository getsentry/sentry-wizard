/* eslint-disable max-lines */
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import { builders, generateCode, parseModule } from 'magicast';
import * as path from 'path';

import {
  abort,
  abortIfCancelled,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  installPackage,
  printWelcome,
  SentryProjectData,
} from './clack-utils';

interface NextjsWizardOptions {
  promoCode?: string;
}

/**
 * TODO
 */
// eslint-disable-next-line complexity
export async function runNextjsWizard(
  options: NextjsWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Next.js Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const packageJsonFileContents = await fs.promises
    .readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    .catch(() => {
      clack.log.error(
        'Could not find package.json. Make sure to run the wizard in the root of your Next.js app!',
      );
      abort();
    });

  let packageJson:
    | { dependencies?: { ['@sentry/nextjs']: string; ['next']: string } }
    | undefined = undefined;

  try {
    packageJson = JSON.parse(packageJsonFileContents);
  } catch (e) {
    clack.log.error(
      'Unable to parse your package.json. Make sure it has a valid format!',
    );

    abort();
  }

  if (!packageJson?.dependencies?.['next']) {
    const continueWithoutNext = await clack.confirm({
      message:
        'Next.js does not seem to be installed. Do you still want to continue?',
      initialValue: false,
    });

    abortIfCancelled(continueWithoutNext);

    if (!continueWithoutNext) {
      abort();
    }
  }

  const { url: sentryUrl, selfHosted } = await askForSelfHosted();

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: options.promoCode,
    url: sentryUrl,
  });

  const selectedProject: SentryProjectData | symbol = await clack.select({
    message: 'Select your Sentry project.',
    options: projects.map(project => {
      return {
        value: project,
        label: `${project.organization.slug}/${project.slug}`,
      };
    }),
  });

  abortIfCancelled(selectedProject);

  await installPackage({
    packageName: '@sentry/nextjs',
    alreadyInstalled: !!packageJson?.dependencies?.['@sentry/nextjs'],
  });

  let isUsingTypescript = false;
  try {
    isUsingTypescript = fs.existsSync(
      path.join(process.cwd(), 'tsconfig.json'),
    );
  } catch (e) {
    // noop - Default to assuming user is not using typescript
  }

  const configVariants = ['server', 'client', 'edge'] as const;

  for (const configVariant of configVariants) {
    const jsConfig = `sentry.${configVariant}.config.js`;
    const tsConfig = `sentry.${configVariant}.config.ts`;

    const jsConfigExists = fs.existsSync(path.join(process.cwd(), jsConfig));
    const tsConfigExists = fs.existsSync(path.join(process.cwd(), tsConfig));

    let shouldWriteFile: boolean = true;

    if (jsConfigExists || tsConfigExists) {
      const existingConfigs = [];

      if (jsConfigExists) {
        existingConfigs.push(jsConfig);
      }

      if (tsConfigExists) {
        existingConfigs.push(tsConfig);
      }

      const overwriteExistingConfigs = await clack.confirm({
        message: `Found existing Sentry ${configVariant} config (${existingConfigs.join(
          ', ',
        )}). Overwrite ${existingConfigs.length > 1 ? 'them' : 'it'}?`,
      });

      abortIfCancelled(overwriteExistingConfigs);

      shouldWriteFile = overwriteExistingConfigs;

      if (overwriteExistingConfigs) {
        if (jsConfigExists) {
          fs.unlinkSync(path.join(process.cwd(), jsConfig));
          clack.log.warn(`Removed existing ${chalk.bold(jsConfig)}.`);
        }
        if (tsConfigExists) {
          fs.unlinkSync(path.join(process.cwd(), tsConfig));
          clack.log.warn(`Removed existing ${chalk.bold(tsConfig)}.`);
        }
      }
    }

    if (shouldWriteFile) {
      await fs.promises.writeFile(
        path.join(process.cwd(), isUsingTypescript ? tsConfig : jsConfig),
        getSentryConfigContents(
          selectedProject.keys[0].dsn.public,
          configVariant,
        ),
        { encoding: 'utf8', flag: 'w' },
      );
      clack.log.success(
        `Created fresh ${chalk.bold(isUsingTypescript ? tsConfig : jsConfig)}.`,
      );
    }
  }

  const webpackOptionsTemplate = `{
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // If set to true, suppresses all source map uploading logs during build
    silent: false,

    org: "${selectedProject.organization.slug}",
    project: "${selectedProject.slug}",
  }`;

  const sentryBuildOptionsTemplate = `{
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,
  }`;

  const newNextConfigTemplate = `const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(
  nextConfig,
  ${webpackOptionsTemplate},
  ${sentryBuildOptionsTemplate}
);
`;

  const nextConfigJs = 'next.config.js';
  const nextConfigMjs = 'next.config.mjs';

  const nextConfigJsExists = fs.existsSync(
    path.join(process.cwd(), nextConfigJs),
  );
  const nextConfigMjsExists = fs.existsSync(
    path.join(process.cwd(), nextConfigMjs),
  );

  if (!nextConfigJsExists && !nextConfigMjsExists) {
    await fs.promises.writeFile(
      path.join(process.cwd(), nextConfigJs),
      newNextConfigTemplate,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.bold('next.config.js')} with Sentry configuration.`,
    );
  }

  if (nextConfigJsExists) {
    const nextConfgiJsContent = fs.readFileSync(
      path.join(process.cwd(), nextConfigJs),
      'utf8',
    );

    const probablyIncludesSdk =
      nextConfgiJsContent.includes('@sentry/nextjs') &&
      nextConfgiJsContent.includes('withSentryConfig');

    let shouldInject = true;

    if (probablyIncludesSdk) {
      const injectAnyhow = await clack.confirm({
        message: `${chalk.bold(
          nextConfigMjs,
        )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
      });

      abortIfCancelled(injectAnyhow);

      shouldInject = injectAnyhow;
    }

    if (shouldInject) {
      const cjsAppendix = `

// Inected Content via Sentry Wizard Below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  module.exports,
  ${webpackOptionsTemplate},
  ${sentryBuildOptionsTemplate}
);
`;
      fs.appendFileSync(
        path.join(process.cwd(), nextConfigJs),
        cjsAppendix,
        'utf8',
      );

      clack.log.success(
        `Added Sentry configuration to ${chalk.bold(nextConfigJs)}. ${chalk.dim(
          '(you probably want to clean this up a bit!)',
        )}`,
      );
    }
  }

  if (nextConfigMjsExists) {
    const nextConfgiMjsContent = fs.readFileSync(
      path.join(process.cwd(), nextConfigMjs),
      'utf8',
    );

    const probablyIncludesSdk =
      nextConfgiMjsContent.includes('@sentry/nextjs') &&
      nextConfgiMjsContent.includes('withSentryConfig');

    let shouldInject = true;

    if (probablyIncludesSdk) {
      const injectAnyhow = await clack.confirm({
        message: `${chalk.bold(
          nextConfigMjs,
        )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
      });

      abortIfCancelled(injectAnyhow);
      shouldInject = injectAnyhow;
    }

    try {
      if (shouldInject) {
        const mod = parseModule(nextConfgiMjsContent);
        mod.imports.$add({
          from: '@sentry/nextjs',
          imported: 'withSentryConfig',
          local: 'withSentryConfig',
        });
        const expressionToWrap = generateCode(mod.exports.default.$ast).code;
        mod.exports.default = builders.raw(`withSentryConfig(
      ${expressionToWrap},
      ${webpackOptionsTemplate},
      ${sentryBuildOptionsTemplate}
)`);
        const newCode = mod.generate().code;

        await fs.promises.writeFile(
          path.join(process.cwd(), nextConfigMjs),
          newCode,
          {
            encoding: 'utf8',
            flag: 'w',
          },
        );
        clack.log.success(
          `Added Sentry configuration to ${chalk.bold(
            nextConfigMjs,
          )}. ${chalk.dim('(you probably want to clean this up a bit!)')}`,
        );
      }
    } catch (e) {
      clack.log.warn(
        chalk.yellow(
          `Something went wrong writing to ${chalk.bold(nextConfigMjs)}`,
        ),
      );
      clack.log.info(
        `Please put the following code snippet into ${chalk.bold(
          nextConfigMjs,
        )}: ${chalk.dim('You probably have to clean it up a bit.')}\n`,
      );

      // eslint-disable-next-line no-console
      console.log(`\n
// next.config.mjs
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(
  yourNextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // If set to true, suppresses all logs during build
    silent: false,

    org: "sentry-javascript-sdks",
    project: "vercel-test",
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,
  }
);\n`);

      const shouldContinue = await clack.confirm({
        message: `Are you done putting the snippet above into ${chalk.bold(
          nextConfigMjs,
        )}?`,
        active: 'Yes',
        inactive: 'No, get me out of here',
      });

      abortIfCancelled(shouldContinue);
      if (!shouldContinue) {
        abort();
      }
    }
  }

  const maybePagesDirPath = path.join(process.cwd(), 'pages');
  const maybeSrcPagesDirPath = path.join(process.cwd(), 'src', 'pages');

  let pagesLocation =
    fs.existsSync(maybePagesDirPath) &&
    fs.lstatSync(maybePagesDirPath).isDirectory()
      ? ['pages']
      : fs.existsSync(maybeSrcPagesDirPath) &&
        fs.lstatSync(maybeSrcPagesDirPath).isDirectory()
      ? ['src', 'pages']
      : undefined;

  if (!pagesLocation) {
    pagesLocation = ['pages'];
    fs.mkdirSync(path.join(process.cwd(), ...pagesLocation), {
      recursive: true,
    });
  }

  if (pagesLocation) {
    const examplePageContents = createExamplePage({
      selfHosted,
      orgSlug: selectedProject.organization.slug,
      projectId: selectedProject.id,
      url: sentryUrl,
    });

    await fs.promises.writeFile(
      path.join(process.cwd(), ...pagesLocation, 'sentry-example-page.js'),
      examplePageContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.bold(
        path.join(...pagesLocation, 'sentry-example-page.js'),
      )}.`,
    );

    fs.mkdirSync(path.join(process.cwd(), ...pagesLocation, 'api'), {
      recursive: true,
    });

    await fs.promises.writeFile(
      path.join(
        process.cwd(),
        ...pagesLocation,
        'api',
        'sentry-example-api.js',
      ),
      exampleApiRoute,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.bold(
        path.join(...pagesLocation, 'api', 'sentry-example-api.js'),
      )}.`,
    );
  }

  const clircExists = fs.existsSync(path.join(process.cwd(), '.sentryclirc'));
  if (clircExists) {
    const clircContents = fs.readFileSync(
      path.join(process.cwd(), '.sentryclirc'),
      'utf8',
    );

    const likelyAlreadyHasAuthToken = !!(
      clircContents.includes('[auth]') && clircContents.match(/token=./g)
    );

    if (likelyAlreadyHasAuthToken) {
      clack.log.warn(
        `${chalk.bold(
          '.sentryclirc',
        )} already has auth token. Will not add one.`,
      );
    } else {
      try {
        await fs.promises.writeFile(
          path.join(process.cwd(), '.sentryclirc'),
          `${clircContents}\n[auth]\ntoken=${apiKeys.token}`,
          { encoding: 'utf8', flag: 'w' },
        );
        clack.log.success(`Added auth token to ${chalk.bold('.sentryclirc')}`);
      } catch (e) {
        clack.log.warning(
          `Failed to add auth token to ${chalk.bold(
            '.sentryclirc',
          )}. Uploading source maps during build will likely not work.`,
        );
      }
    }
  } else {
    try {
      await fs.promises.writeFile(
        path.join(process.cwd(), '.sentryclirc'),
        `[auth]\ntoken=${apiKeys.token}`,
        { encoding: 'utf8', flag: 'w' },
      );
      clack.log.success(
        `Created ${chalk.bold('.sentryclirc')} with auth token.`,
      );
    } catch (e) {
      clack.log.warning(
        `Failed to create ${chalk.bold(
          '.sentryclirc',
        )} with auth token. Uploading source maps during build will likely not work.`,
      );
    }
  }

  const mightBeUsingVercel = fs.existsSync(
    path.join(process.cwd(), 'vercel.json'),
  );

  clack.outro(
    `${chalk.green('Everything is set up!')}

   ${chalk.cyan(
     'You can validate your setup by starting your dev environment (`next dev`) and visiting "/sentry-example-page".',
   )}
${
  mightBeUsingVercel
    ? `
   ▲ It seems like you're using Vercel. We recommend using the Sentry Vercel integration: https://vercel.com/integrations/sentry
`
    : ''
}
   ${chalk.dim(
     'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-javascript/issues',
   )}`,
  );
}

/**
 * TODO
 */
function getSentryConfigContents(
  dsn: string,
  config: 'server' | 'client' | 'edge',
): string {
  let primer;
  if (config === 'server') {
    primer = `// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  } else if (config === 'client') {
    primer = `// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  } else if (config === 'edge') {
    primer = `// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Verel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  }

  let additionalOptions = '';
  if (config === 'client') {
    additionalOptions = `

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    new Sentry.Replay({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],`;
  }

  return `${primer}

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "${dsn}",

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // This will print useful information to the console while you're setting up Sentry.
  // You should set this to false before deploying to production.
  debug: true,${additionalOptions}
});
`;
}

function createExamplePage(options: {
  selfHosted: boolean;
  url: string;
  orgSlug: string;
  projectId: string;
}): string {
  const issuesPageLink = options.selfHosted
    ? `${options.url}organizations/${options.orgSlug}/issues/?project=${options.projectId}`
    : `https://${options.orgSlug}.sentry.io/issues/?project=${options.projectId}`;

  return `import Head from "next/head";
import * as Sentry from "@sentry/nextjs";

export default function Home() {
  return (
    <div>
      <Head>
        <title>Sentry Onboarding</title>
        <meta name="description" content="Test Sentry for your Next.js app!" />
      </Head>

      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: "4rem", margin: "14px 0" }}>
          <svg
            style={{
              height: "1em",
            }}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 44"
          >
            <path
              fill="currentColor"
              d="M124.32,28.28,109.56,9.22h-3.68V34.77h3.73V15.19l15.18,19.58h3.26V9.22h-3.73ZM87.15,23.54h13.23V20.22H87.14V12.53h14.93V9.21H83.34V34.77h18.92V31.45H87.14ZM71.59,20.3h0C66.44,19.06,65,18.08,65,15.7c0-2.14,1.89-3.59,4.71-3.59a12.06,12.06,0,0,1,7.07,2.55l2-2.83a14.1,14.1,0,0,0-9-3c-5.06,0-8.59,3-8.59,7.27,0,4.6,3,6.19,8.46,7.52C74.51,24.74,76,25.78,76,28.11s-2,3.77-5.09,3.77a12.34,12.34,0,0,1-8.3-3.26l-2.25,2.69a15.94,15.94,0,0,0,10.42,3.85c5.48,0,9-2.95,9-7.51C79.75,23.79,77.47,21.72,71.59,20.3ZM195.7,9.22l-7.69,12-7.64-12h-4.46L186,24.67V34.78h3.84V24.55L200,9.22Zm-64.63,3.46h8.37v22.1h3.84V12.68h8.37V9.22H131.08ZM169.41,24.8c3.86-1.07,6-3.77,6-7.63,0-4.91-3.59-8-9.38-8H154.67V34.76h3.8V25.58h6.45l6.48,9.2h4.44l-7-9.82Zm-10.95-2.5V12.6h7.17c3.74,0,5.88,1.77,5.88,4.84s-2.29,4.86-5.84,4.86Z M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43a4.49,4.49,0,0,0-.62-2.28Z"
            ></path>
          </svg>
        </h1>

        <p>Get started by sending us a sample error:</p>
        <button
          type="button"
          style={{
            padding: "12px",
            cursor: "pointer",
            backgroundColor: "#AD6CAA",
            borderRadius: "4px",
            border: "none",
            color: "white",
            fontSize: "14px",
            margin: "18px",
          }}
          onClick={async () => {
            const transaction = Sentry.startTransaction({
              name: "Example Frontend Transaction",
            });

            Sentry.configureScope((scope) => {
              scope.setSpan(transaction);
            });

            try {
              const res = await fetch("/api/sentry-example-api");
              if (!res.ok) {
                throw new Error("Sentry Example Frontend Error");
              }
            } finally {
              transaction.finish();
            }
          }}
        >
          Throw error!
        </button>

        <p>
          Next, look for the error on the{" "}
          <a href="${issuesPageLink}">Issues Page</a>.
        </p>
        <p style={{ marginTop: "24px" }}>
          For more information, see{" "}
          <a href="https://docs.sentry.io/platforms/javascript/guides/nextjs/">
            https://docs.sentry.io/platforms/javascript/guides/nextjs/
          </a>
        </p>
      </main>
    </div>
  );
}
`;
}

const exampleApiRoute = `// A faulty API route to test Sentry's error monitoring
export default function handler(_req, res) {
  throw new Error("Sentry Example API Route Error");
  res.status(200).json({ name: "John Doe" });
}
`;
