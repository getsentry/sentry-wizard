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
  featureSelectionPrompt,
  getOrAskForProjectData,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  showCopyPasteInstructions,
} from '../utils/clack-utils';
import type { SentryProjectData, WizardOptions } from '../utils/types';
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
  getSentryExamplePagesDirApiRoute,
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

  const typeScriptDetected = isUsingTypeScript();

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
    const reactComponentAnnotation =
      await askShouldEnableReactComponentAnnotation();

    await createOrMergeNextJsFiles(selectedProject, selfHosted, sentryUrl, {
      tunnelRoute,
      reactComponentAnnotation,
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
      const newGlobalErrorFileName = `global-error.${
        typeScriptDetected ? 'tsx' : 'jsx'
      }`;

      await fs.promises.writeFile(
        path.join(process.cwd(), ...appDirLocation, newGlobalErrorFileName),
        getSentryDefaultGlobalErrorPage(typeScriptDetected),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan(
          path.join(...appDirLocation, newGlobalErrorFileName),
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

  const isLikelyUsingTurbopack = await checkIfLikelyIsUsingTurbopack();
  if (isLikelyUsingTurbopack || isLikelyUsingTurbopack === null) {
    await abortIfCancelled(
      clack.select({
        message: `Warning: The Sentry SDK doesn't yet fully support Turbopack in dev mode. The SDK will not be loaded in the browser, and serverside instrumentation will be inaccurate or incomplete. Production builds will still fully work. ${chalk.bold(
          `To continue this setup, if you are using Turbopack, temporarily remove \`--turbo\` from your dev command until you have verified the SDK is working as expected.`,
        )}`,
        options: [
          {
            label: 'I understand.',
            hint: 'press enter',
            value: true,
          },
        ],
        initialValue: true,
      }),
    );
  }

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

  const pacMan = await getPackageManager();

  clack.outro(`${chalk.green(
    'Successfully installed the Sentry Next.js SDK!',
  )}${
    shouldCreateExamplePage
      ? `\n\nYou can validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
          `${pacMan.runScriptCommand} dev`,
        )}) and visiting ${chalk.cyan('"/sentry-example-page"')}`
      : ''
  }${
    shouldCreateExamplePage && isLikelyUsingTurbopack
      ? `\nDon't forget to remove \`--turbo\` from your dev command until you have verified the SDK is working. You can safely add it back afterwards.`
      : ''
  }

${chalk.dim(
  'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-javascript/issues',
)}`);
}

type SDKConfigOptions = {
  tunnelRoute: boolean;
  reactComponentAnnotation: boolean;
};

async function createOrMergeNextJsFiles(
  selectedProject: SentryProjectData,
  selfHosted: boolean,
  sentryUrl: string,
  sdkConfigOptions: SDKConfigOptions,
) {
  const selectedFeatures = await featureSelectionPrompt([
    {
      id: 'performance',
      prompt: `Do you want to enable ${chalk.bold(
        'Tracing',
      )} to track the performance of your application?`,
      enabledHint: 'recommended',
    },
    {
      id: 'replay',
      prompt: `Do you want to enable ${chalk.bold(
        'Sentry Session Replay',
      )} to get a video-like reproduction of errors during a user session?`,
      enabledHint: 'recommended, but increases bundle size',
    },
  ] as const);

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
            selectedFeatures,
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
    const hasRootAppDirectory = hasDirectoryPathFromRoot('app');
    const hasRootPagesDirectory = hasDirectoryPathFromRoot('pages');
    const hasSrcDirectory = hasDirectoryPathFromRoot('src');

    let instrumentationHookLocation: 'src' | 'root' | 'does-not-exist';

    const instrumentationTsExists = fs.existsSync(
      path.join(process.cwd(), 'instrumentation.ts'),
    );
    const instrumentationJsExists = fs.existsSync(
      path.join(process.cwd(), 'instrumentation.js'),
    );
    const srcInstrumentationTsExists = fs.existsSync(
      path.join(process.cwd(), 'src', 'instrumentation.ts'),
    );
    const srcInstrumentationJsExists = fs.existsSync(
      path.join(process.cwd(), 'src', 'instrumentation.js'),
    );

    // https://nextjs.org/docs/app/building-your-application/configuring/src-directory
    // https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
    // The logic for where Next.js picks up the instrumentation file is as follows:
    // - If there is either an `app` folder or a `pages` folder in the root directory of your Next.js app, Next.js looks
    // for an `instrumentation.ts` file in the root of the Next.js app.
    // - Otherwise, if there is neither an `app` folder or a `pages` folder in the rood directory of your Next.js app,
    // AND if there is an `src` folder, Next.js will look for the `instrumentation.ts` file in the `src` folder.
    if (hasRootPagesDirectory || hasRootAppDirectory) {
      if (instrumentationJsExists || instrumentationTsExists) {
        instrumentationHookLocation = 'root';
      } else {
        instrumentationHookLocation = 'does-not-exist';
      }
    } else {
      if (srcInstrumentationTsExists || srcInstrumentationJsExists) {
        instrumentationHookLocation = 'src';
      } else {
        instrumentationHookLocation = 'does-not-exist';
      }
    }

    const newInstrumentationFileName = `instrumentation.${
      typeScriptDetected ? 'ts' : 'js'
    }`;

    if (instrumentationHookLocation === 'does-not-exist') {
      let newInstrumentationHookLocation: 'root' | 'src';
      if (hasRootPagesDirectory || hasRootAppDirectory) {
        newInstrumentationHookLocation = 'root';
      } else if (hasSrcDirectory) {
        newInstrumentationHookLocation = 'src';
      } else {
        newInstrumentationHookLocation = 'root';
      }

      const newInstrumentationHookPath =
        newInstrumentationHookLocation === 'root'
          ? path.join(process.cwd(), newInstrumentationFileName)
          : path.join(process.cwd(), 'src', newInstrumentationFileName);

      const successfullyCreated = await createNewConfigFile(
        newInstrumentationHookPath,
        getInstrumentationHookContent(newInstrumentationHookLocation),
      );

      if (!successfullyCreated) {
        await showCopyPasteInstructions(
          newInstrumentationFileName,
          getInstrumentationHookCopyPasteSnippet(
            newInstrumentationHookLocation,
          ),
        );
      }
    } else {
      await showCopyPasteInstructions(
        srcInstrumentationTsExists || instrumentationTsExists
          ? 'instrumentation.ts'
          : srcInstrumentationJsExists || instrumentationJsExists
          ? 'instrumentation.js'
          : newInstrumentationFileName,
        getInstrumentationHookCopyPasteSnippet(instrumentationHookLocation),
      );
    }
  });

  await traceStep('setup-next-config', async () => {
    const withSentryConfigOptionsTemplate = getWithSentryConfigOptionsTemplate({
      orgSlug: selectedProject.organization.slug,
      projectSlug: selectedProject.slug,
      selfHosted,
      sentryUrl,
      tunnelRoute: sdkConfigOptions.tunnelRoute,
      reactComponentAnnotation: sdkConfigOptions.reactComponentAnnotation,
    });

    const nextConfigPossibleFilesMap = {
      js: 'next.config.js',
      mjs: 'next.config.mjs',
      cjs: 'next.config.cjs',
      ts: 'next.config.ts',
      mts: 'next.config.mts',
      cts: 'next.config.cts',
    };

    const foundNextConfigFile = Object.entries(nextConfigPossibleFilesMap).find(
      ([, fileName]) => fs.existsSync(path.join(process.cwd(), fileName)),
    );

    if (!foundNextConfigFile) {
      Sentry.setTag('next-config-strategy', 'create');

      await fs.promises.writeFile(
        // We are creating a `next.config.js` file by default as it is supported by the most Next.js versions
        path.join(process.cwd(), nextConfigPossibleFilesMap.js),
        getNextjsConfigCjsTemplate(withSentryConfigOptionsTemplate),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan('next.config.js')} with Sentry configuration.`,
      );

      return;
    }

    const [foundNextConfigFileType, foundNextConfigFileFilename] =
      foundNextConfigFile;

    if (foundNextConfigFileType === 'js' || foundNextConfigFileType === 'cjs') {
      Sentry.setTag('next-config-strategy', 'modify');

      const nextConfigCjsContent = fs.readFileSync(
        path.join(process.cwd(), foundNextConfigFileFilename),
        'utf8',
      );

      const probablyIncludesSdk =
        nextConfigCjsContent.includes('@sentry/nextjs') &&
        nextConfigCjsContent.includes('withSentryConfig');

      let shouldInject = true;

      if (probablyIncludesSdk) {
        const injectAnyhow = await abortIfCancelled(
          clack.confirm({
            message: `${chalk.cyan(
              foundNextConfigFileFilename,
            )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
          }),
        );

        shouldInject = injectAnyhow;
      }

      if (shouldInject) {
        await fs.promises.appendFile(
          path.join(process.cwd(), foundNextConfigFileFilename),
          getNextjsConfigCjsAppendix(withSentryConfigOptionsTemplate),
          'utf8',
        );

        clack.log.success(
          `Added Sentry configuration to ${chalk.cyan(
            foundNextConfigFileFilename,
          )}. ${chalk.dim('(you probably want to clean this up a bit!)')}`,
        );
      }

      Sentry.setTag('next-config-mod-result', 'success');
    }

    if (
      foundNextConfigFileType === 'mjs' ||
      foundNextConfigFileType === 'mts' ||
      foundNextConfigFileType === 'cts' ||
      foundNextConfigFileType === 'ts'
    ) {
      const nextConfigMjsContent = fs.readFileSync(
        path.join(process.cwd(), foundNextConfigFileFilename),
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
              foundNextConfigFileFilename,
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
            path.join(process.cwd(), foundNextConfigFileFilename),
            newCode,
            {
              encoding: 'utf8',
              flag: 'w',
            },
          );
          clack.log.success(
            `Added Sentry configuration to ${chalk.cyan(
              foundNextConfigFileFilename,
            )}. ${chalk.dim('(you probably want to clean this up a bit!)')}`,
          );

          Sentry.setTag('next-config-mod-result', 'success');
        }
      } catch {
        Sentry.setTag('next-config-mod-result', 'fail');
        clack.log.warn(
          chalk.yellow(
            `Something went wrong writing to ${chalk.cyan(
              foundNextConfigFileFilename,
            )}.`,
          ),
        );
        clack.log.info(
          `Please put the following code snippet into ${chalk.cyan(
            foundNextConfigFileFilename,
          )}: ${chalk.dim('You probably have to clean it up a bit.')}\n`,
        );

        // eslint-disable-next-line no-console
        console.log(
          getNextjsConfigEsmCopyPasteSnippet(withSentryConfigOptionsTemplate),
        );

        const shouldContinue = await abortIfCancelled(
          clack.confirm({
            message: `Are you done putting the snippet above into ${chalk.cyan(
              foundNextConfigFileFilename,
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

function hasDirectoryPathFromRoot(dirnameOrDirs: string | string[]): boolean {
  const dirPath = Array.isArray(dirnameOrDirs)
    ? path.join(process.cwd(), ...dirnameOrDirs)
    : path.join(process.cwd(), dirnameOrDirs);

  return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory();
}

async function createExamplePage(
  selfHosted: boolean,
  selectedProject: SentryProjectData,
  sentryUrl: string,
): Promise<void> {
  const hasSrcDirectory = hasDirectoryPathFromRoot('src');
  const hasRootAppDirectory = hasDirectoryPathFromRoot('app');
  const hasRootPagesDirectory = hasDirectoryPathFromRoot('pages');
  const hasSrcAppDirectory = hasDirectoryPathFromRoot(['src', 'app']);
  const hasSrcPagesDirectory = hasDirectoryPathFromRoot(['src', 'pages']);

  Sentry.setTag('nextjs-app-dir', hasRootAppDirectory || hasSrcAppDirectory);

  const typeScriptDetected = isUsingTypeScript();

  // If `pages` or an `app` directory exists in the root, we'll put the example page there.
  // `app` directory takes priority over `pages` directory when they coexist, so we prioritize that.
  // https://nextjs.org/docs/app/building-your-application/routing#the-app-router

  const appFolderLocation = hasRootAppDirectory
    ? ['app']
    : hasSrcAppDirectory
    ? ['src', 'app']
    : undefined;

  let pagesFolderLocation = hasRootPagesDirectory
    ? ['pages']
    : hasSrcPagesDirectory
    ? ['src', 'pages']
    : undefined;

  // If the user has neither pages nor app directory we create a pages folder for them
  if (!appFolderLocation && !pagesFolderLocation) {
    const newPagesFolderLocation = hasSrcDirectory
      ? ['src', 'pages']
      : ['pages'];
    fs.mkdirSync(path.join(process.cwd(), ...newPagesFolderLocation), {
      recursive: true,
    });

    pagesFolderLocation = newPagesFolderLocation;
  }

  if (appFolderLocation) {
    const examplePageContents = getSentryExamplePageContents({
      selfHosted,
      orgSlug: selectedProject.organization.slug,
      projectId: selectedProject.id,
      sentryUrl,
      useClient: true,
    });

    fs.mkdirSync(
      path.join(process.cwd(), ...appFolderLocation, 'sentry-example-page'),
      {
        recursive: true,
      },
    );

    const newPageFileName = `page.${typeScriptDetected ? 'tsx' : 'jsx'}`;

    await fs.promises.writeFile(
      path.join(
        process.cwd(),
        ...appFolderLocation,
        'sentry-example-page',
        newPageFileName,
      ),
      examplePageContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...appFolderLocation, 'sentry-example-page', newPageFileName),
      )}.`,
    );

    fs.mkdirSync(
      path.join(
        process.cwd(),
        ...appFolderLocation,
        'api',
        'sentry-example-api',
      ),
      {
        recursive: true,
      },
    );

    const newRouteFileName = `route.${typeScriptDetected ? 'ts' : 'js'}`;

    await fs.promises.writeFile(
      path.join(
        process.cwd(),
        ...appFolderLocation,
        'api',
        'sentry-example-api',
        newRouteFileName,
      ),
      getSentryExampleAppDirApiRoute(),
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(
          ...appFolderLocation,
          'api',
          'sentry-example-api',
          newRouteFileName,
        ),
      )}.`,
    );
  } else if (pagesFolderLocation) {
    const examplePageContents = getSentryExamplePageContents({
      selfHosted,
      orgSlug: selectedProject.organization.slug,
      projectId: selectedProject.id,
      sentryUrl,
      useClient: false,
    });

    await fs.promises.writeFile(
      path.join(
        process.cwd(),
        ...pagesFolderLocation,
        'sentry-example-page.jsx',
      ),
      examplePageContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...pagesFolderLocation, 'sentry-example-page.js'),
      )}.`,
    );

    fs.mkdirSync(path.join(process.cwd(), ...pagesFolderLocation, 'api'), {
      recursive: true,
    });

    await fs.promises.writeFile(
      path.join(
        process.cwd(),
        ...pagesFolderLocation,
        'api',
        'sentry-example-api.js',
      ),
      getSentryExamplePagesDirApiRoute(),
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...pagesFolderLocation, 'api', 'sentry-example-api.js'),
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
          'Do you want to route Sentry requests in the browser through your Next.js server to avoid ad blockers?',
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
        initialValue: true,
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

async function askShouldEnableReactComponentAnnotation() {
  return await traceStep('ask-react-component-annotation-option', async () => {
    const shouldEnableReactComponentAnnotation = await abortIfCancelled(
      clack.select({
        message:
          'Do you want to enable React component annotations to make breadcrumbs and session replays more readable?',
        options: [
          {
            label: 'Yes',
            value: true,
            hint: 'Annotates React component names - increases bundle size',
          },
          {
            label: 'No',
            value: false,
            hint: 'Continue without React component annotations',
          },
        ],
        initialValue: true,
      }),
    );

    return shouldEnableReactComponentAnnotation;
  });
}

/**
 * Returns true or false depending on whether we think the user is using Turbopack. May return null in case we aren't sure.
 */
async function checkIfLikelyIsUsingTurbopack(): Promise<boolean | null> {
  let packageJsonContent: string;
  try {
    packageJsonContent = await fs.promises.readFile(
      path.join(process.cwd(), 'package.json'),
      'utf8',
    );
  } catch {
    return null;
  }

  return packageJsonContent.includes('--turbo');
}
