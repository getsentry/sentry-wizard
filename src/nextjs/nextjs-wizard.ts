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
  addSentryCliConfig,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  installPackage,
  isUsingTypeScript,
  printWelcome,
} from '../utils/clack-utils';
import { SentryProjectData, WizardOptions } from '../utils/types';
import {
  getNextjsConfigCjsAppendix,
  getNextjsConfigCjsTemplate,
  getNextjsConfigEsmCopyPasteSnippet,
  getNextjsSentryBuildOptionsTemplate,
  getNextjsWebpackPluginOptionsTemplate,
  getSentryConfigContents,
  getSentryExampleApiRoute,
  getSentryExampleAppDirApiRoute,
  getSentryExamplePageContents,
} from './templates';
import { traceStep, withTelemetry } from '../telemetry';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { getNextJsVersionBucket } from './utils';

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
    packageName: '@sentry/nextjs',
    alreadyInstalled: !!packageJson?.dependencies?.['@sentry/nextjs'],
  });

  await traceStep('configure-sdk', async () =>
    createOrMergeNextJsFiles(selectedProject, selfHosted, sentryUrl),
  );

  await traceStep('create-example-page', async () =>
    createExamplePage(selfHosted, selectedProject, sentryUrl),
  );

  await addSentryCliConfig({ authToken });

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

async function createOrMergeNextJsFiles(
  selectedProject: SentryProjectData,
  selfHosted: boolean,
  sentryUrl: string,
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
          path.join(process.cwd(), typeScriptDetected ? tsConfig : jsConfig),
          getSentryConfigContents(
            selectedProject.keys[0].dsn.public,
            configVariant,
          ),
          { encoding: 'utf8', flag: 'w' },
        );
        clack.log.success(
          `Created fresh ${chalk.bold(
            typeScriptDetected ? tsConfig : jsConfig,
          )}.`,
        );
        Sentry.setTag(`created-${configVariant}-config`, true);
      }
    });
  }

  const sentryWebpackOptionsTemplate = getNextjsWebpackPluginOptionsTemplate(
    selectedProject.organization.slug,
    selectedProject.slug,
    selfHosted,
    sentryUrl,
  );
  const sentryBuildOptionsTemplate = getNextjsSentryBuildOptionsTemplate();

  const nextConfigJs = 'next.config.js';
  const nextConfigMjs = 'next.config.mjs';

  await traceStep('setup-next-config', async () => {
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
        getNextjsConfigCjsTemplate(
          sentryWebpackOptionsTemplate,
          sentryBuildOptionsTemplate,
        ),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.bold('next.config.js')} with Sentry configuration.`,
      );
    }

    if (nextConfigJsExists) {
      Sentry.setTag('next-config-strategy', 'modify');

      const nextConfgiJsContent = fs.readFileSync(
        path.join(process.cwd(), nextConfigJs),
        'utf8',
      );

      const probablyIncludesSdk =
        nextConfgiJsContent.includes('@sentry/nextjs') &&
        nextConfgiJsContent.includes('withSentryConfig');

      let shouldInject = true;

      if (probablyIncludesSdk) {
        const injectAnyhow = await abortIfCancelled(
          clack.confirm({
            message: `${chalk.bold(
              nextConfigJs,
            )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
          }),
        );

        shouldInject = injectAnyhow;
      }

      if (shouldInject) {
        await fs.promises.appendFile(
          path.join(process.cwd(), nextConfigJs),
          getNextjsConfigCjsAppendix(
            sentryWebpackOptionsTemplate,
            sentryBuildOptionsTemplate,
          ),
          'utf8',
        );

        clack.log.success(
          `Added Sentry configuration to ${chalk.bold(
            nextConfigJs,
          )}. ${chalk.dim('(you probably want to clean this up a bit!)')}`,
        );
      }

      Sentry.setTag('next-config-mod-result', 'success');
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
        const injectAnyhow = await abortIfCancelled(
          clack.confirm({
            message: `${chalk.bold(
              nextConfigMjs,
            )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
          }),
        );

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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          const expressionToWrap = generateCode(mod.exports.default.$ast).code;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          mod.exports.default = builders.raw(`withSentryConfig(
      ${expressionToWrap},
      ${sentryWebpackOptionsTemplate},
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

          Sentry.setTag('next-config-mod-result', 'success');
        }
      } catch {
        Sentry.setTag('next-config-mod-result', 'fail');
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
        console.log(
          getNextjsConfigEsmCopyPasteSnippet(
            sentryWebpackOptionsTemplate,
            sentryBuildOptionsTemplate,
          ),
        );

        const shouldContinue = await abortIfCancelled(
          clack.confirm({
            message: `Are you done putting the snippet above into ${chalk.bold(
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
      `Created ${chalk.bold(
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
      `Created ${chalk.bold(
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
      getSentryExampleApiRoute(),
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.bold(
        path.join(...pagesLocation, 'api', 'sentry-example-api.js'),
      )}.`,
    );
  }
}
