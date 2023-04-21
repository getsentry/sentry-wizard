/* eslint-disable max-lines */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, parseModule } from 'magicast';
import * as path from 'path';

import {
  abort,
  abortIfCancelled,
  addSentryCliRc,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  ensurePackageIsInstalled,
  installPackage,
  printWelcome,
  SentryProjectData,
} from '../utils/clack-utils';
import {
  getNextjsConfigCjsAppendix,
  getNextjsConfigCjsTemplate,
  getNextjsConfigEsmCopyPasteSnippet,
  getNextjsSentryBuildOptionsTemplate,
  getNextjsWebpackPluginOptionsTemplate,
  getSentryConfigContents,
  getSentryExampleApiRoute,
  getSentryExamplePageContents,
} from '../templates/nextjs-templates';
import { getPackageDotJson } from '../utils/package-utils';

interface NextjsWizardOptions {
  promoCode?: string;
}

// eslint-disable-next-line complexity
export async function runNextjsWizard(
  options: NextjsWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Next.js Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const packageJson = await getPackageDotJson();
  await ensurePackageIsInstalled(packageJson, 'next', 'Next.js');

  const { url: sentryUrl, selfHosted } = await askForSelfHosted();

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: options.promoCode,
    url: sentryUrl,
  });

  const selectedProject: SentryProjectData | symbol = await clack.select({
    message: 'Select your Sentry project.',
    options: projects.map((project) => {
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
  } catch {
    // noop - Default to assuming user is not using typescript
  }

  const configVariants = ['server', 'client', 'edge'] as const;

  for (const configVariant of configVariants) {
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

  const sentryWebpackOptionsTemplate = getNextjsWebpackPluginOptionsTemplate(
    selectedProject.organization.slug,
    selectedProject.slug,
  );
  const sentryBuildOptionsTemplate = getNextjsSentryBuildOptionsTemplate();

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
          nextConfigJs,
        )} already contains Sentry SDK configuration. Should the wizard modify it anyways?`,
      });

      abortIfCancelled(injectAnyhow);

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
      }
    } catch {
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
    const examplePageContents = getSentryExamplePageContents({
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
      getSentryExampleApiRoute(),
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.bold(
        path.join(...pagesLocation, 'api', 'sentry-example-api.js'),
      )}.`,
    );
  }

  await addSentryCliRc(apiKeys.token);

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
