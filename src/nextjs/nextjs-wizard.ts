/* eslint-disable max-lines */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, parseModule } from 'magicast';
import * as path from 'path';

import * as Sentry from '@sentry/node';

import {
  abort,
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
  askShouldCreateExamplePage,
  confirmContinueIfNoOrDirtyGitRepo,
  createNewConfigFile,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  showCopyPasteInstructions,
} from '../utils/clack-utils';
import { SentryProjectData, WizardOptions } from '../utils/types';
import {
  getFullUnderscoreErrorCopyPasteSnippet,
  getGlobalErrorCopyPasteSnippet,
  getInstrumentationHookContent,
  getInstrumentationHookCopyPasteSnippet,
  getNextjsConfigCjsAppendix,
  getNextjsConfigCjsTemplate,
  getNextjsConfigEsmCopyPasteSnippet,
  getSentryConfigContents,
  getSentryDefaultGlobalErrorPage,
  getSentryDefaultUnderscoreErrorPage,
  getSentryExampleApiRoute,
  getSentryExampleAppDirApiRoute,
  getSentryExamplePageContents,
  getSimpleUnderscoreErrorCopyPasteSnippet,
  getWithSentryConfigOptionsTemplate,
} from './templates';
import { traceStep, withTelemetry } from '../telemetry';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { getNextJsVersionBucket } from './utils';
import { configureCI } from '../sourcemaps/sourcemaps-wizard';

export function runNextjsWizard(options: WizardOptions) {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'nextjs',
    },
    () => runNextjsWizardWithTelemetry(options),
  );
}

export async function runNextjsWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Next.js Wizard',
    promoCode: options.promoCode,
    telemetryEnabled: options.telemetryEnabled,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();

  await ensurePackageIsInstalled(packageJson, 'next', 'Next.js');

  const nextVersion = getPackageVersion('next', packageJson);
  Sentry.setTag('nextjs-version', getNextJsVersionBucket(nextVersion));

  const { selectedProject, authToken, selfHosted, sentryUrl } =
    await getOrAskForProjectData(options, 'javascript-nextjs');

  const sdkAlreadyInstalled = hasPackageInstalled(
    '@sentry/nextjs',
    packageJson,
  );
  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  await installPackage({
    packageName: '@sentry/nextjs@^8',
    alreadyInstalled: !!packageJson?.dependencies?.['@sentry/nextjs'],
  });

  await traceStep('configure-sdk', async () => {
    const tunnelRoute = await askShouldSetTunnelRoute();

    await createOrMergeNextJsFiles(selectedProject, selfHosted, sentryUrl, {
      tunnelRoute,
    });
  });

  await traceStep('create-underscoreerror-page', async () => {
    const srcDir = path.join(process.cwd(), 'src');
    const maybePagesDirPath = path.join(process.cwd(), 'pages');
    const maybeSrcPagesDirPath = path.join(srcDir, 'pages');

    const pagesLocation =
      fs.existsSync(maybePagesDirPath) &&
      fs.lstatSync(maybePagesDirPath).isDirectory()
        ? ['pages']
        : fs.existsSync(maybeSrcPagesDirPath) &&
          fs.lstatSync(maybeSrcPagesDirPath).isDirectory()
        ? ['src', 'pages']
        : undefined;

    if (!pagesLocation) {
      return;
    }

    const underscoreErrorPageFile = fs.existsSync(
      path.join(process.cwd(), ...pagesLocation, '_error.tsx'),
    )
      ? '_error.tsx'
      : fs.existsSync(path.join(process.cwd(), ...pagesLocation, '_error.ts'))
      ? '_error.ts'
      : fs.existsSync(path.join(process.cwd(), ...pagesLocation, '_error.jsx'))
      ? '_error.jsx'
      : fs.existsSync(path.join(process.cwd(), ...pagesLocation, '_error.js'))
      ? '_error.js'
      : undefined;

    if (!underscoreErrorPageFile) {
      await fs.promises.writeFile(
        path.join(process.cwd(), ...pagesLocation, '_error.jsx'),
        getSentryDefaultUnderscoreErrorPage(),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan(path.join(...pagesLocation, '_error.jsx'))}.`,
      );
    } else if (
      fs
        .readFileSync(
          path.join(process.cwd(), ...pagesLocation, underscoreErrorPageFile),
          'utf8',
        )
        .includes('getInitialProps')
    ) {
      clack.log.info(
        `It seems like you already have a custom error page.\n\nPlease put the following function call in the ${chalk.bold(
          'getInitialProps',
        )}\nmethod of your custom error page at ${chalk.bold(
          path.join(...pagesLocation, underscoreErrorPageFile),
        )}:`,
      );

      // eslint-disable-next-line no-console
      console.log(getSimpleUnderscoreErrorCopyPasteSnippet());

      const shouldContinue = await abortIfCancelled(
        clack.confirm({
          message: `Did you modify your ${chalk.cyan(
            path.join(...pagesLocation, underscoreErrorPageFile),
          )} file as described above?`,
          active: 'Yes',
          inactive: 'No, get me out of here',
        }),
      );

      if (!shouldContinue) {
        await abort();
      }
    } else {
      clack.log.info(
        `It seems like you already have a custom error page.\n\nPlease add the following code to your custom error page\nat ${chalk.cyan(
          path.join(...pagesLocation, underscoreErrorPageFile),
        )}:`,
      );

      // eslint-disable-next-line no-console
      console.log(
        getFullUnderscoreErrorCopyPasteSnippet(
          underscoreErrorPageFile === '_error.ts' ||
            underscoreErrorPageFile === '_error.tsx',
        ),
      );

      const shouldContinue = await abortIfCancelled(
        clack.confirm({
          message: `Did add the code to your ${chalk.cyan(
            path.join(...pagesLocation, underscoreErrorPageFile),
          )} file as described above?`,
          active: 'Yes',
          inactive: 'No, get me out of here',
        }),
      );

      if (!shouldContinue) {
        await abort();
      }
    }
  });

  await traceStep('create-global-error-page', async () => {
    const maybeAppDirPath = path.join(process.cwd(), 'app');
    const maybeSrcAppDirPath = path.join(process.cwd(), 'src', 'app');

    const appDirLocation =
      fs.existsSync(maybeAppDirPath) &&
      fs.lstatSync(maybeAppDirPath).isDirectory()
        ? ['app']
        : fs.existsSync(maybeSrcAppDirPath) &&
          fs.lstatSync(maybeSrcAppDirPath).isDirectory()
        ? ['src', 'app']
        : undefined;

    if (!appDirLocation) {
      return;
    }

    const globalErrorPageFile = fs.existsSync(
      path.join(process.cwd(), ...appDirLocation, 'global-error.tsx'),
    )
      ? 'global-error.tsx'
      : fs.existsSync(
          path.join(process.cwd(), ...appDirLocation, 'global-error.ts'),
        )
      ? 'global-error.ts'
      : fs.existsSync(
          path.join(process.cwd(), ...appDirLocation, 'global-error.jsx'),
        )
      ? 'global-error.jsx'
      : fs.existsSync(
          path.join(process.cwd(), ...appDirLocation, 'global-error.js'),
        )
      ? 'global-error.js'
      : undefined;

    if (!globalErrorPageFile) {
      await fs.promises.writeFile(
        path.join(process.cwd(), ...appDirLocation, 'global-error.jsx'),
        getSentryDefaultGlobalErrorPage(),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan(
          path.join(...appDirLocation, 'global-error.jsx'),
        )}.`,
      );
    } else {
      clack.log.info(
        `It seems like you already have a custom error page for your app directory.\n\nPlease add the following code to your custom error page\nat ${chalk.cyan(
          path.join(...appDirLocation, globalErrorPageFile),
        )}:\n`,
      );

      // eslint-disable-next-line no-console
      console.log(
        getGlobalErrorCopyPasteSnippet(
          globalErrorPageFile === 'global-error.ts' ||
            globalErrorPageFile === 'global-error.tsx',
        ),
      );

      const shouldContinue = await abortIfCancelled(
        clack.confirm({
          message: `Did add the code to your ${chalk.cyan(
            path.join(...appDirLocation, globalErrorPageFile),
          )} file as described above?`,
          active: 'Yes',
          inactive: 'No, get me out of here',
        }),
      );

      if (!shouldContinue) {
        await abort();
      }
    }
  });

  const shouldCreateExamplePage = await askShouldCreateExamplePage();
  if (shouldCreateExamplePage) {
    await traceStep('create-example-page', async () =>
      createExamplePage(selfHosted, selectedProject, sentryUrl),
    );
  }

  await addDotEnvSentryBuildPluginFile(authToken);

  const mightBeUsingVercel = fs.existsSync(
    path.join(process.cwd(), 'vercel.json'),
  );

  if (mightBeUsingVercel) {
    clack.log.info(
      "▲ It seems like you're using Vercel. We recommend using the Sentry Vercel integration to set up an auth token for Vercel deployments: https://vercel.com/integrations/sentry",
    );
  } else {
    await traceStep('configure-ci', () => configureCI('nextjs', authToken));
  }

  clack.outro(`
${chalk.green('Successfully installed the Sentry Next.js SDK!')} ${
    shouldCreateExamplePage
      ? `\n\nYou can validate your setup by restarting your dev environment (${chalk.cyan(
          `next dev`,
        )}) and visiting ${chalk.cyan('"/sentry-example-page"')}`
      : ''
  }

${chalk.dim(
  'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-javascript/issues',
)}`);
}

type SDKConfigOptions = {
  tunnelRoute: boolean;
};

async function createOrMergeNextJsFiles(
  selectedProject: SentryProjectData,
  selfHosted: boolean,
  sentryUrl: string,
  sdkConfigOptions: SDKConfigOptions,
) {
  const typeScriptDetected = isUsingTypeScript();

  const configVariants = ['server', 'client', 'edge'] as const;

  for (const configVariant of configVariants) {
    await traceStep(`create-sentry-${configVariant}-config`, async () => {
      const jsConfig = `sentry.${configVariant}.config.js`;
      const tsConfig = `sentry.${configVariant}.config.ts`;

      const jsConfigExists = fs.existsSync(path.join(process.cwd(), jsConfig));
      const tsConfigExists = fs.existsSync(path.join(process.cwd(), tsConfig));

      let shouldWriteFile = true;

      if (jsConfigExists || tsConfigExists) {
        const existingConfigs = [];

        if (jsConfigExists) {
          existingConfigs.push(jsConfig);
        }

        if (tsConfigExists) {
          existingConfigs.push(tsConfig);
        }

        const overwriteExistingConfigs = await abortIfCancelled(
          clack.confirm({
            message: `Found existing Sentry ${configVariant} config (${existingConfigs.join(
              ', ',
            )}). Overwrite ${existingConfigs.length > 1 ? 'them' : 'it'}?`,
          }),
        );
        Sentry.setTag(
          `overwrite-${configVariant}-config`,
          overwriteExistingConfigs,
        );

        shouldWriteFile = overwriteExistingConfigs;

        if (overwriteExistingConfigs) {
          if (jsConfigExists) {
            fs.unlinkSync(path.join(process.cwd(), jsConfig));
            clack.log.warn(`Removed existing ${chalk.cyan(jsConfig)}.`);
          }
          if (tsConfigExists) {
            fs.unlinkSync(path.join(process.cwd(), tsConfig));
            clack.log.warn(`Removed existing ${chalk.cyan(tsConfig)}.`);
          }
        }
      }

      if (shouldWriteFile) {
        await fs.promises.writeFile(
          path.join(process.cwd(), typeScriptDetected ? tsConfig : jsConfig),
          getSentryConfigContents(
            selectedProject.keys[0].dsn.public,
            configVariant,
          ),
          { encoding: 'utf8', flag: 'w' },
        );
        clack.log.success(
          `Created fresh ${chalk.cyan(
            typeScriptDetected ? tsConfig : jsConfig,
          )}.`,
        );
        Sentry.setTag(`created-${configVariant}-config`, true);
      }
    });
  }

  await traceStep('setup-instrumentation-hook', async () => {
    const srcInstrumentationTsExists = fs.existsSync(
      path.join(process.cwd(), 'src', 'instrumentation.ts'),
    );
    const srcInstrumentationJsExists = fs.existsSync(
      path.join(process.cwd(), 'src', 'instrumentation.js'),
    );
    const instrumentationTsExists = fs.existsSync(
      path.join(process.cwd(), 'instrumentation.ts'),
    );
    const instrumentationJsExists = fs.existsSync(
      path.join(process.cwd(), 'instrumentation.js'),
    );

    let instrumentationHookLocation: 'src' | 'root' | 'does-not-exist';
    if (srcInstrumentationTsExists || srcInstrumentationJsExists) {
      instrumentationHookLocation = 'src';
    } else if (instrumentationTsExists || instrumentationJsExists) {
      instrumentationHookLocation = 'root';
    } else {
      instrumentationHookLocation = 'does-not-exist';
    }

    if (instrumentationHookLocation === 'does-not-exist') {
      const srcFolderExists = fs.existsSync(path.join(process.cwd(), 'src'));

      const instrumentationHookPath = srcFolderExists
        ? path.join(process.cwd(), 'src', 'instrumentation.ts')
        : path.join(process.cwd(), 'instrumentation.ts');

      const successfullyCreated = await createNewConfigFile(
        instrumentationHookPath,
        getInstrumentationHookContent(srcFolderExists ? 'src' : 'root'),
      );

      if (!successfullyCreated) {
        await showCopyPasteInstructions(
          'instrumentation.ts',
          getInstrumentationHookCopyPasteSnippet(
            srcFolderExists ? 'src' : 'root',
          ),
        );
      }
    } else {
      await showCopyPasteInstructions(
        srcInstrumentationTsExists
          ? 'instrumentation.ts'
          : srcInstrumentationJsExists
          ? 'instrumentation.js'
          : instrumentationTsExists
          ? 'instrumentation.ts'
          : 'instrumentation.js',
        getInstrumentationHookCopyPasteSnippet(instrumentationHookLocation),
      );
    }
  });

  await traceStep('setup-next-config', async () => {
    const withSentryConfigOptionsTemplate = getWithSentryConfigOptionsTemplate({
      orgSlug: selectedProject.organization.slug,
      projectSlug: selectedProject.slug,
      selfHosted,
      url: sentryUrl,
      tunnelRoute: sdkConfigOptions.tunnelRoute,
    });

    const nextConfigJs = 'next.config.js';
    const nextConfigMjs = 'next.config.mjs';

    const nextConfigJsExists = fs.existsSync(
      path.join(process.cwd(), nextConfigJs),
    );
    const nextConfigMjsExists = fs.existsSync(
      path.join(process.cwd(), nextConfigMjs),
    );

    if (!nextConfigJsExists && !nextConfigMjsExists) {
      Sentry.setTag('next-config-strategy', 'create');

      await fs.promises.writeFile(
        path.join(process.cwd(), nextConfigJs),
        getNextjsConfigCjsTemplate(withSentryConfigOptionsTemplate),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan('next.config.js')} with Sentry configuration.`,
      );
    }

    if (nextConfigJsExists) {
      Sentry.setTag('next-config-strategy', 'modify');

      const nextConfigJsContent = fs.readFileSync(
        path.join(process.cwd(), nextConfigJs),
        'utf8',
      );

      const probablyIncludesSdk =
        nextConfigJsContent.includes('@sentry/nextjs') &&
        nextConfigJsContent.includes('withSentryConfig');

      let shouldInject = true;

      if (probablyIncludesSdk) {
        const injectAnyhow = await abortIfCancelled(
          clack.confirm({
            message: `${chalk.cyan(
              nextConfigJs,
            )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
          }),
        );

        shouldInject = injectAnyhow;
      }

      if (shouldInject) {
        await fs.promises.appendFile(
          path.join(process.cwd(), nextConfigJs),
          getNextjsConfigCjsAppendix(withSentryConfigOptionsTemplate),
          'utf8',
        );

        clack.log.success(
          `Added Sentry configuration to ${chalk.cyan(
            nextConfigJs,
          )}. ${chalk.dim('(you probably want to clean this up a bit!)')}`,
        );
      }

      Sentry.setTag('next-config-mod-result', 'success');
    }

    if (nextConfigMjsExists) {
      const nextConfigMjsContent = fs.readFileSync(
        path.join(process.cwd(), nextConfigMjs),
        'utf8',
      );

      const probablyIncludesSdk =
        nextConfigMjsContent.includes('@sentry/nextjs') &&
        nextConfigMjsContent.includes('withSentryConfig');

      let shouldInject = true;

      if (probablyIncludesSdk) {
        const injectAnyhow = await abortIfCancelled(
          clack.confirm({
            message: `${chalk.cyan(
              nextConfigMjs,
            )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
          }),
        );

        shouldInject = injectAnyhow;
      }

      try {
        if (shouldInject) {
          const mod = parseModule(nextConfigMjsContent);
          mod.imports.$add({
            from: '@sentry/nextjs',
            imported: 'withSentryConfig',
            local: 'withSentryConfig',
          });
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          const expressionToWrap = generateCode(mod.exports.default.$ast).code;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          mod.exports.default = builders.raw(`withSentryConfig(
      ${expressionToWrap},
      ${withSentryConfigOptionsTemplate}
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
            `Added Sentry configuration to ${chalk.cyan(
              nextConfigMjs,
            )}. ${chalk.dim('(you probably want to clean this up a bit!)')}`,
          );

          Sentry.setTag('next-config-mod-result', 'success');
        }
      } catch {
        Sentry.setTag('next-config-mod-result', 'fail');
        clack.log.warn(
          chalk.yellow(
            `Something went wrong writing to ${chalk.cyan(nextConfigMjs)}`,
          ),
        );
        clack.log.info(
          `Please put the following code snippet into ${chalk.cyan(
            nextConfigMjs,
          )}: ${chalk.dim('You probably have to clean it up a bit.')}\n`,
        );

        // eslint-disable-next-line no-console
        console.log(
          getNextjsConfigEsmCopyPasteSnippet(withSentryConfigOptionsTemplate),
        );

        const shouldContinue = await abortIfCancelled(
          clack.confirm({
            message: `Are you done putting the snippet above into ${chalk.cyan(
              nextConfigMjs,
            )}?`,
            active: 'Yes',
            inactive: 'No, get me out of here',
          }),
        );

        if (!shouldContinue) {
          await abort();
        }
      }
    }
  });
}

async function createExamplePage(
  selfHosted: boolean,
  selectedProject: SentryProjectData,
  sentryUrl: string,
): Promise<void> {
  const srcDir = path.join(process.cwd(), 'src');
  const maybePagesDirPath = path.join(process.cwd(), 'pages');
  const maybeSrcPagesDirPath = path.join(srcDir, 'pages');
  const maybeAppDirPath = path.join(process.cwd(), 'app');
  const maybeSrcAppDirPath = path.join(srcDir, 'app');

  let pagesLocation =
    fs.existsSync(maybePagesDirPath) &&
    fs.lstatSync(maybePagesDirPath).isDirectory()
      ? ['pages']
      : fs.existsSync(maybeSrcPagesDirPath) &&
        fs.lstatSync(maybeSrcPagesDirPath).isDirectory()
      ? ['src', 'pages']
      : undefined;

  const appLocation =
    fs.existsSync(maybeAppDirPath) &&
    fs.lstatSync(maybeAppDirPath).isDirectory()
      ? ['app']
      : fs.existsSync(maybeSrcAppDirPath) &&
        fs.lstatSync(maybeSrcAppDirPath).isDirectory()
      ? ['src', 'app']
      : undefined;

  if (!pagesLocation && !appLocation) {
    pagesLocation =
      fs.existsSync(srcDir) && fs.lstatSync(srcDir).isDirectory()
        ? ['src', 'pages']
        : ['pages'];
    fs.mkdirSync(path.join(process.cwd(), ...pagesLocation), {
      recursive: true,
    });
  }

  Sentry.setTag('nextjs-app-dir', !!appLocation);

  if (appLocation) {
    const examplePageContents = getSentryExamplePageContents({
      selfHosted,
      orgSlug: selectedProject.organization.slug,
      projectId: selectedProject.id,
      url: sentryUrl,
      useClient: true,
    });

    fs.mkdirSync(
      path.join(process.cwd(), ...appLocation, 'sentry-example-page'),
      {
        recursive: true,
      },
    );

    await fs.promises.writeFile(
      path.join(
        process.cwd(),
        ...appLocation,
        'sentry-example-page',
        'page.jsx',
      ),
      examplePageContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...appLocation, 'sentry-example-page', 'page.jsx'),
      )}.`,
    );

    fs.mkdirSync(
      path.join(process.cwd(), ...appLocation, 'api', 'sentry-example-api'),
      {
        recursive: true,
      },
    );

    await fs.promises.writeFile(
      path.join(
        process.cwd(),
        ...appLocation,
        'api',
        'sentry-example-api',
        'route.js',
      ),
      getSentryExampleAppDirApiRoute(),
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...appLocation, 'api', 'sentry-example-api', 'route.js'),
      )}.`,
    );
  } else if (pagesLocation) {
    const examplePageContents = getSentryExamplePageContents({
      selfHosted,
      orgSlug: selectedProject.organization.slug,
      projectId: selectedProject.id,
      url: sentryUrl,
      useClient: false,
    });

    await fs.promises.writeFile(
      path.join(process.cwd(), ...pagesLocation, 'sentry-example-page.jsx'),
      examplePageContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
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
      getSentryExampleApiRoute(),
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...pagesLocation, 'api', 'sentry-example-api.js'),
      )}.`,
    );
  }
}

/**
 * Ask users if they want to set the tunnelRoute option.
 * We can't set this by default because it potentially increases hosting bills.
 * It's valuable enough to for users to justify asking the additional question.
 */
async function askShouldSetTunnelRoute() {
  return await traceStep('ask-tunnelRoute-option', async () => {
    const shouldSetTunnelRoute = await abortIfCancelled(
      clack.select({
        message:
          'Do you want to route Sentry requests in the browser through your NextJS server to avoid ad blockers?',
        options: [
          {
            label: 'Yes',
            value: true,
            hint: 'Can increase your server load and hosting bill',
          },
          {
            label: 'No',
            value: false,
            hint: 'Browser errors and events might be blocked by ad blockers before being sent to Sentry',
          },
        ],
        initialValue: false,
      }),
    );

    if (!shouldSetTunnelRoute) {
      clack.log.info(
        "Sounds good! We'll leave the option commented for later, just in case :)",
      );
    }

    return shouldSetTunnelRoute;
  });
}
