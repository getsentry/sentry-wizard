import * as clack from '@clack/prompts';
import axios from 'axios';
import chalk from 'chalk';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { setInterval } from 'timers';
import { URL } from 'url';
import { promisify } from 'util';

const SENTRY_BASE_URL = 'https://sentry.io/';

let wizardPackage: { version?: string } = {};

try {
  wizardPackage = require(path.join(
    path.dirname(require.resolve('@sentry/wizard')),
    '..',
    'package.json',
  ));
} catch {
  // We don't need to have this
}

interface WizardProjectData {
  apiKeys: {
    token: string;
  };
  projects: {
    id: string;
    slug: string;
    name: string;
    organization: {
      slug: string;
    };
    keys: [{ dsn: { secret: string; public: string } }];
  }[];
}

interface NextjsWizardOptions {
  promoCode?: string;
}

/**
 * TODO
 */
export async function runNextjsWizard(
  options: NextjsWizardOptions,
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('');
  clack.intro(chalk.inverse(' Sentry Next.js Wizard '));

  let welcomeText =
    'This Wizard will help you to set up Sentry for your Next.js SDK.\nThank you for using Sentry :)';

  if (options.promoCode) {
    welcomeText += `\n\nUsing promo-code: ${options.promoCode}`;
  }

  if (wizardPackage.version) {
    welcomeText += `\n\nVersion: ${wizardPackage.version}`;
  }

  clack.note(welcomeText);

  try {
    childProcess.execSync('git rev-parse --is-inside-work-tree', {
      stdio: 'ignore',
    });
  } catch (e) {
    const continueWithoutGit = await clack.confirm({
      message:
        'You are not inside a git repository. The wizard will create and update files. Do you still want to continue?',
    });

    abortIfCancelled(continueWithoutGit);

    if (!continueWithoutGit) {
      abort();
    }
  }

  const packageJsonFileContents = await promisify(fs.readFile)(
    path.join(process.cwd(), 'package.json'),
    'utf8',
  ).catch(() => {
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

  const hasSentryAccount = await clack.confirm({
    message: 'Do you already have a Sentry account?',
  });

  abortIfCancelled(hasSentryAccount);

  let wizardHash: string;
  try {
    wizardHash = (await axios.get(`${SENTRY_BASE_URL}api/0/wizard/`)).data.hash;
  } catch (e) {
    clack.log.error('Loading Wizard failed.');
    clack.outro(
      chalk.red(
        'Please try again in a few minutes and let us know if this issue persists: https://github.com/getsentry/sentry-wizard/issues',
      ),
    );

    return process.exit(1);
  }

  const loginUrl = new URL(
    `${SENTRY_BASE_URL}account/settings/wizard/${wizardHash}/`,
  );

  if (!hasSentryAccount) {
    loginUrl.searchParams.set('signup', '1');
    loginUrl.searchParams.set('project_platform', 'javascript-nextjs');
  }

  if (options.promoCode) {
    loginUrl.searchParams.set('code', options.promoCode);
  }

  clack.log.info(
    `${chalk.bold(
      `Please open the following link in your browser to ${
        hasSentryAccount ? 'log' : 'sign'
      } into Sentry:`,
    )}\n\n${chalk.cyan(loginUrl.toString())}`,
  );

  const loginSpinner = clack.spinner();

  loginSpinner.start(
    'Waiting for you to click the link above 👆. Take your time.',
  );

  const { apiKeys, projects } = await new Promise<WizardProjectData>(
    resolve => {
      const pollingInterval = setInterval(async () => {
        let wizardData;
        try {
          wizardData = (
            await axios.get(`${SENTRY_BASE_URL}api/0/wizard/${wizardHash}/`)
          ).data;
        } catch (e) {
          // noop - try again
          return;
        }

        resolve(wizardData);

        clearTimeout(timeout);
        clearInterval(pollingInterval);

        void axios.delete(`${SENTRY_BASE_URL}api/0/wizard/${wizardHash}/`);
      }, 500);

      const timeout = setTimeout(() => {
        clearInterval(pollingInterval);
        loginSpinner.stop(
          'Login timed out. No worries - it happens to the best of us.',
        );
        clack.outro(
          'Please restart the Wizard and log in to complete the setup.',
        );
        return process.exit(0);
      }, 180_000);
    },
  );

  loginSpinner.stop('Login complete.');

  const selectedProject = await clack.select({
    message: 'Select your Sentry project.',
    options: projects.map(project => {
      return {
        value: project,
        label: `${project.organization.slug}/${project.slug}`,
      };
    }),
  });

  let shouldInstallSdk: boolean;
  let installExplanation: string = '';
  if (packageJson?.dependencies?.['@sentry/nextjs']) {
    const shouldUpdateSdk = await clack.confirm({
      message: `The ${chalk.bold.cyan(
        '@sentry/nextjs',
      )} package is already installed. Do you want to update it to the latest version?`,
    });

    abortIfCancelled(shouldUpdateSdk);

    shouldInstallSdk = shouldUpdateSdk;
  } else {
    installExplanation = `The wizard would like to install the ${chalk.bold.cyan(
      '@sentry/nextjs',
    )} package. `;
    shouldInstallSdk = true;
  }

  if (shouldInstallSdk) {
    const packageManager: 'yarn' | 'pnpm' | 'npm' | symbol = await clack.select(
      {
        message: `${installExplanation}Which package manager are you using?`,
        options: [
          { value: 'yarn', label: 'yarn' },
          { value: 'pnpm', label: 'pnpm' },
          { value: 'npm', label: 'npm' },
        ],
      },
    );

    abortIfCancelled(packageManager);

    const sdkInstallSpinner = clack.spinner();

    sdkInstallSpinner.start(
      `Installing ${chalk.bold.cyan('@sentry/nextjs')} with ${chalk.bold(
        packageManager,
      )}.`,
    );

    try {
      if (packageManager === 'yarn') {
        await promisify(childProcess.exec)('yarn add @sentry/nextjs@latest');
      } else if (packageManager === 'pnpm') {
        await promisify(childProcess.exec)('pnpm add @sentry/nextjs@latest');
      } else if (packageManager === 'npm') {
        await promisify(childProcess.exec)('npm install @sentry/nextjs@latest');
      }
    } catch (e) {
      sdkInstallSpinner.stop('Installation failed.');
      clack.log.error(
        `${chalk.red(
          'Encountered the following error during installation:',
        )}\n\n${e.stack}\n\n${chalk.dim(
          'If you think this issue is caused by the Sentry wizard, let us know here:\nhttps://github.com/getsentry/sentry-wizard/issues',
        )}`,
      );
      clack.outro('Wizard setup cancelled.');
      return process.exit(1);
    }

    sdkInstallSpinner.stop(
      `Installed ${chalk.bold.cyan('@sentry/nextjs')} with ${chalk.bold(
        packageManager,
      )}.`,
    );
  }

  clack.outro(
    `${chalk.green(
      "You're all set!",
    )}\n   If you encounter any issues, let us know here: https://github.com/getsentry/sentry-javascript/issues`,
  );
}

/**
 * TODO
 */
function abort(): never {
  clack.outro('Wizard setup cancelled.');
  return process.exit(0);
}

/**
 * TODO
 */
function abortIfCancelled<T>(input: T): asserts input is Exclude<T, symbol> {
  if (clack.isCancel(input)) {
    clack.cancel('Wizard setup cancelled.');
    return process.exit(0);
  } else {
    return;
  }
}
