import * as clack from '@clack/prompts';
import axios from 'axios';
import chalk from 'chalk';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { setInterval } from 'timers';
import { URL } from 'url';
import { promisify } from 'util';

interface WizardProjectData {
  apiKeys: {
    token: string;
  };
  projects: SentryProjectData[];
}

export interface SentryProjectData {
  id: string;
  slug: string;
  name: string;
  organization: {
    slug: string;
  };
  keys: [{ dsn: { public: string } }];
}

/**
 * TODO
 */
export function abort(): never {
  clack.outro('Wizard setup cancelled.');
  return process.exit(0);
}

/**
 * TODO
 */
export function abortIfCancelled<T>(
  input: T,
): asserts input is Exclude<T, symbol> {
  if (clack.isCancel(input)) {
    clack.cancel('Wizard setup cancelled.');
    return process.exit(0);
  } else {
    return;
  }
}

/**
 * TODO
 */
export function printWelcome(options: {
  wizardName: string;
  promoCode?: string;
}): void {
  let wizardPackage: { version?: string } = {};

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    wizardPackage = require(path.join(
      path.dirname(require.resolve('@sentry/wizard')),
      '..',
      'package.json',
    ));
  } catch {
    // We don't need to have this
  }

  // eslint-disable-next-line no-console
  console.log('');
  clack.intro(chalk.inverse(` ${options.wizardName} `));

  let welcomeText =
    'This Wizard will help you to set up Sentry for your application.\nThank you for using Sentry :)';

  if (options.promoCode) {
    welcomeText += `\n\nUsing promo-code: ${options.promoCode}`;
  }

  if (wizardPackage.version) {
    welcomeText += `\n\nVersion: ${wizardPackage.version}`;
  }

  clack.note(welcomeText);
}

/**
 * TODO
 */
export async function confirmContinueEvenThoughNoGitRepo(): Promise<void> {
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
}

/**
 * TODO
 */
export async function askForWizardLogin(options: {
  url: string;
  promoCode?: string;
}): Promise<WizardProjectData> {
  const hasSentryAccount = await clack.confirm({
    message: 'Do you already have a Sentry account?',
  });

  abortIfCancelled(hasSentryAccount);

  let wizardHash: string;
  try {
    wizardHash = (
      await axios.get<{ hash: string }>(`${options.url}api/0/wizard/`)
    ).data.hash;
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
    `${options.url}account/settings/wizard/${wizardHash}/`,
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

  const data = await new Promise<WizardProjectData>(resolve => {
    const pollingInterval = setInterval(() => {
      axios
        .get<WizardProjectData>(`${options.url}api/0/wizard/${wizardHash}/`)
        .then(result => {
          resolve(result.data);
          clearTimeout(timeout);
          clearInterval(pollingInterval);
          void axios.delete(`${options.url}api/0/wizard/${wizardHash}/`);
        })
        .catch(() => {
          // noop - just try again
        });
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
  });

  loginSpinner.stop('Login complete.');

  return data;
}

/**
 * TODO
 */
export async function installPackage({
  packageName,
  alreadyInstalled,
}: {
  packageName: string;
  alreadyInstalled: boolean;
}): Promise<void> {
  if (alreadyInstalled) {
    const shouldUpdatePackage = await clack.confirm({
      message: `The ${chalk.bold.cyan(
        packageName,
      )} package is already installed. Do you want to update it to the latest version?`,
    });

    abortIfCancelled(shouldUpdatePackage);
    return;
  }

  const sdkInstallSpinner = clack.spinner();

  let detectedPackageManager;
  if (fs.existsSync(path.join(process.cwd(), 'yarn.lock'))) {
    detectedPackageManager = 'yarn';
  } else if (fs.existsSync(path.join(process.cwd(), 'package-lock.json'))) {
    detectedPackageManager = 'npm';
  } else if (fs.existsSync(path.join(process.cwd(), 'pnpm-lock.yaml'))) {
    detectedPackageManager = 'pnpm';
  } else {
    detectedPackageManager = 'npm';
  }

  sdkInstallSpinner.start(
    `${alreadyInstalled ? 'Updating' : 'Installing'} ${chalk.bold.cyan(
      packageName,
    )} with ${chalk.bold(detectedPackageManager)}.`,
  );

  try {
    if (detectedPackageManager === 'yarn') {
      await promisify(childProcess.exec)(`yarn add ${packageName}@latest`);
    } else if (detectedPackageManager === 'pnpm') {
      await promisify(childProcess.exec)(`pnpm add ${packageName}@latest`);
    } else if (detectedPackageManager === 'npm') {
      await promisify(childProcess.exec)(`npm install ${packageName}@latest`);
    }
  } catch (e) {
    sdkInstallSpinner.stop('Installation failed.');
    clack.log.error(
      `${chalk.red(
        'Encountered the following error during installation:',
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      )}\n\n${e}\n\n${chalk.dim(
        'If you think this issue is caused by the Sentry wizard, let us know here:\nhttps://github.com/getsentry/sentry-wizard/issues',
      )}`,
    );
    clack.outro('Wizard setup cancelled.');
    return process.exit(1);
  }

  sdkInstallSpinner.stop(
    `${alreadyInstalled ? 'Updated' : 'Installed'} ${chalk.bold.cyan(
      packageName,
    )} with ${chalk.bold(detectedPackageManager)}.`,
  );
}

/**
 *
 */
export async function askForSelfHosted(): Promise<{
  url: string;
  selfHosted: boolean;
}> {
  const choice: 'saas' | 'self-hosted' | symbol = await clack.select({
    message: 'Are you using Sentry SaaS or self-hosted Sentry?',
    options: [
      { value: 'saas', label: 'Sentry SaaS (sentry.io)' },
      { value: 'self-hosted', label: 'Self-hosted/on-premise' },
    ],
  });

  abortIfCancelled(choice);

  if (choice === 'saas') {
    return { url: 'https://sentry.io/', selfHosted: false };
  }

  const url = await clack.text({
    message: 'Please enter the URL of your self-hosted Sentry instance.',
    placeholder: 'https://sentry.io/',
  });

  abortIfCancelled(url);

  return { url, selfHosted: true };
}

/**
 * TODO
 */
export async function addSentryCliRc(authToken: string): Promise<void> {
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
          `${clircContents}\n[auth]\ntoken=${authToken}\n`,
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
        `[auth]\ntoken=${authToken}\n`,
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

  try {
    await fs.promises.appendFile(
      path.join(process.cwd(), '.gitignore'),
      '\n# Sentry Auth Token\n.sentryclirc\n',
      { encoding: 'utf8' },
    );
    clack.log.success(
      `Added ${chalk.bold('.sentryclirc')} to ${chalk.bold('.gitignore')}.`,
    );
  } catch (e) {
    clack.log.error(
      `Failed adding ${chalk.bold('.sentryclirc')} to ${chalk.bold(
        '.gitignore',
      )}. Please add it manually!`,
    );
  }
}
