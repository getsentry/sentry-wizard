// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import axios from 'axios';
import chalk from 'chalk';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { setInterval } from 'timers';
import { URL } from 'url';
import { promisify } from 'util';
import * as Sentry from '@sentry/node';
import { windowedSelect } from './vendor/clack-custom-select';
import { hasPackageInstalled, PackageDotJson } from './package-json';

const opn = require('opn') as (
  url: string,
) => Promise<childProcess.ChildProcess>;

const SAAS_URL = 'https://sentry.io/';

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
  platform: string;
  organization: {
    slug: string;
  };
  keys: [{ dsn: { public: string } }];
}

export async function abort(message?: string, status?: number): Promise<never> {
  clack.outro(message ?? 'Wizard setup cancelled.');
  const sentryHub = Sentry.getCurrentHub();
  const sentryTransaction = sentryHub.getScope().getTransaction();
  sentryTransaction?.setStatus('aborted');
  sentryTransaction?.finish();
  const sentrySession = sentryHub.getScope().getSession();
  if (sentrySession) {
    sentrySession.status = status === 0 ? 'abnormal' : 'crashed';
    sentryHub.captureSession(true);
  }
  await Sentry.flush(3000);
  return process.exit(status ?? 1);
}

export async function abortIfCancelled<T>(
  input: T | Promise<T>,
): Promise<Exclude<T, symbol>> {
  if (clack.isCancel(await input)) {
    clack.cancel('Wizard setup cancelled.');
    const sentryHub = Sentry.getCurrentHub();
    const sentryTransaction = sentryHub.getScope().getTransaction();
    sentryTransaction?.setStatus('cancelled');
    sentryTransaction?.finish();
    sentryHub.captureSession(true);
    await Sentry.flush(3000);
    process.exit(0);
  } else {
    return input as Exclude<T, symbol>;
  }
}

export function printWelcome(options: {
  wizardName: string;
  promoCode?: string;
  message?: string;
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
    options.message ||
    'This Wizard will help you set up Sentry for your application.\nThank you for using Sentry :)';

  if (options.promoCode) {
    welcomeText += `\n\nUsing promo-code: ${options.promoCode}`;
  }

  if (wizardPackage.version) {
    welcomeText += `\n\nVersion: ${wizardPackage.version}`;
  }

  clack.note(welcomeText);
}

export async function confirmContinueEvenThoughNoGitRepo(): Promise<void> {
  try {
    childProcess.execSync('git rev-parse --is-inside-work-tree', {
      stdio: 'ignore',
    });
  } catch {
    const continueWithoutGit = await abortIfCancelled(
      clack.confirm({
        message:
          'You are not inside a git repository. The wizard will create and update files. Do you still want to continue?',
      }),
    );

    Sentry.setTag('continue-without-git', continueWithoutGit);

    if (!continueWithoutGit) {
      await abort(undefined, 0);
    }
  }
}

export async function askToInstallSentryCLI(): Promise<boolean> {
  return await abortIfCancelled(
    clack.confirm({
      message:
        "You don't have Sentry CLI installed. Do you want to install it?",
    }),
  );
}

export async function askForWizardLogin(options: {
  url: string;
  promoCode?: string;
  platform?: 'javascript-nextjs' | 'javascript-sveltekit' | 'apple-ios';
}): Promise<WizardProjectData> {
  Sentry.setTag('has-promo-code', !!options.promoCode);

  let hasSentryAccount = await clack.confirm({
    message: 'Do you already have a Sentry account?',
  });

  hasSentryAccount = await abortIfCancelled(hasSentryAccount);

  Sentry.setTag('already-has-sentry-account', hasSentryAccount);

  let wizardHash: string;
  try {
    wizardHash = (
      await axios.get<{ hash: string }>(`${options.url}api/0/wizard/`)
    ).data.hash;
  } catch {
    if (options.url !== SAAS_URL) {
      clack.log.error('Loading Wizard failed. Did you provide the right URL?');
      await abort(
        chalk.red(
          'Please check your configuration and try again.\n\n   Let us know if you think this is an issue with the wizard or Sentry: https://github.com/getsentry/sentry-wizard/issues',
        ),
      );
    } else {
      clack.log.error('Loading Wizard failed.');
      await abort(
        chalk.red(
          'Please try again in a few minutes and let us know if this issue persists: https://github.com/getsentry/sentry-wizard/issues',
        ),
      );
    }
  }

  const loginUrl = new URL(
    `${options.url}account/settings/wizard/${wizardHash!}/`,
  );

  if (!hasSentryAccount) {
    loginUrl.searchParams.set('signup', '1');
    if (options.platform) {
      loginUrl.searchParams.set('project_platform', options.platform);
    }
  }

  if (options.promoCode) {
    loginUrl.searchParams.set('code', options.promoCode);
  }

  const urlToOpen = loginUrl.toString();
  clack.log.info(
    `${chalk.bold(
      `If the browser window didn't open automatically, please open the following link to ${
        hasSentryAccount ? 'log' : 'sign'
      } into Sentry:`,
    )}\n\n${chalk.cyan(urlToOpen)}`,
  );

  opn(urlToOpen).catch(() => {
    // opn throws in environments that don't have a browser (e.g. remote shells) so we just noop here
  });

  const loginSpinner = clack.spinner();

  loginSpinner.start(
    "Waiting for you to log in using the link above. Once you're logged in, return to this wizard.",
  );

  const data = await new Promise<WizardProjectData>((resolve) => {
    const pollingInterval = setInterval(() => {
      axios
        .get<WizardProjectData>(`${options.url}api/0/wizard/${wizardHash}/`)
        .then((result) => {
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

      Sentry.setTag('opened-wizard-link', false);
      void abort('Please restart the Wizard and log in to complete the setup.');
    }, 180_000);
  });

  loginSpinner.stop('Login complete.');
  Sentry.setTag('opened-wizard-link', true);

  return data;
}

export async function askForItemSelection(
  items: string[],
  message: string,
): Promise<{ value: string; index: number }> {
  const selection: { value: string; index: number } | symbol =
    await abortIfCancelled(
      windowedSelect({
        maxItems: 12,
        message: message,
        options: items.map((item, index) => {
          return {
            value: { value: item, index: index },
            label: item,
          };
        }),
      }),
    );

  return selection;
}

export async function askForProjectSelection(
  projects: SentryProjectData[],
): Promise<SentryProjectData> {
  const selection: SentryProjectData | symbol = await abortIfCancelled(
    windowedSelect({
      maxItems: 12,
      message: 'Select your Sentry project.',
      options: projects.map((project) => {
        return {
          value: project,
          label: `${project.organization.slug}/${project.slug}`,
        };
      }),
    }),
  );

  Sentry.setTag('project', selection.slug);
  Sentry.setTag('project-platform', selection.platform);
  Sentry.setUser({ id: selection.organization.slug });

  return selection;
}

export async function installPackage({
  packageName,
  alreadyInstalled,
  askBeforeUpdating = true,
}: {
  packageName: string;
  alreadyInstalled: boolean;
  askBeforeUpdating?: boolean;
}): Promise<void> {
  if (alreadyInstalled && askBeforeUpdating) {
    const shouldUpdatePackage = await abortIfCancelled(
      clack.confirm({
        message: `The ${chalk.bold.cyan(
          packageName,
        )} package is already installed. Do you want to update it to the latest version?`,
      }),
    );

    if (!shouldUpdatePackage) {
      return;
    }
  }

  const sdkInstallSpinner = clack.spinner();

  const packageManager = await getPackageManager();

  sdkInstallSpinner.start(
    `${alreadyInstalled ? 'Updating' : 'Installing'} ${chalk.bold.cyan(
      packageName,
    )} with ${chalk.bold(packageManager)}.`,
  );

  try {
    if (packageManager === 'yarn') {
      await promisify(childProcess.exec)(`yarn add ${packageName}@latest`);
    } else if (packageManager === 'pnpm') {
      await promisify(childProcess.exec)(`pnpm add ${packageName}@latest`);
    } else if (packageManager === 'npm') {
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
    await abort();
  }

  sdkInstallSpinner.stop(
    `${alreadyInstalled ? 'Updated' : 'Installed'} ${chalk.bold.cyan(
      packageName,
    )} with ${chalk.bold(packageManager)}.`,
  );
}

/**
 * Asks users if they are using SaaS or self-hosted Sentry and returns the validated URL.
 *
 * If users started the wizard with a --url arg, that URL is used as the default and we skip
 * the self-hosted question. However, the passed url is still validated and in case it's
 * invalid, users are asked to enter a new one until it is valid.
 *
 * @param urlFromArgs the url passed via the --url arg
 */
export async function askForSelfHosted(urlFromArgs?: string): Promise<{
  url: string;
  selfHosted: boolean;
}> {
  if (!urlFromArgs) {
    const choice: 'saas' | 'self-hosted' | symbol = await abortIfCancelled(
      clack.select({
        message: 'Are you using Sentry SaaS or self-hosted Sentry?',
        options: [
          { value: 'saas', label: 'Sentry SaaS (sentry.io)' },
          {
            value: 'self-hosted',
            label: 'Self-hosted/on-premise/single-tenant',
          },
        ],
      }),
    );

    if (choice === 'saas') {
      Sentry.setTag('url', SAAS_URL);
      Sentry.setTag('self-hosted', false);
      return { url: SAAS_URL, selfHosted: false };
    }
  }

  let validUrl: string | undefined;
  let tmpUrlFromArgs = urlFromArgs;

  while (validUrl === undefined) {
    const url =
      tmpUrlFromArgs ||
      (await abortIfCancelled(
        clack.text({
          message: `Please enter the URL of your ${
            urlFromArgs ? '' : 'self-hosted '
          }Sentry instance.`,
          placeholder: 'https://sentry.io/',
        }),
      ));
    tmpUrlFromArgs = undefined;

    try {
      validUrl = new URL(url).toString();

      // We assume everywhere else that the URL ends in a slash
      if (!validUrl.endsWith('/')) {
        validUrl += '/';
      }
    } catch {
      clack.log.error(
        'Please enter a valid URL. (It should look something like "https://sentry.mydomain.com/")',
      );
    }
  }

  const isSelfHostedUrl = new URL(validUrl).host !== new URL(SAAS_URL).host;

  Sentry.setTag('url', validUrl);
  Sentry.setTag('self-hosted', isSelfHostedUrl);

  return { url: validUrl, selfHosted: true };
}

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
        clack.log.success(
          `Added auth token to ${chalk.bold(
            '.sentryclirc',
          )} for you to test uploading source maps locally.`,
        );
      } catch {
        clack.log.warning(
          `Failed to add auth token to ${chalk.bold(
            '.sentryclirc',
          )}. Uploading source maps during build will likely not work locally.`,
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
        `Created ${chalk.bold(
          '.sentryclirc',
        )} with auth token for you to test uploading source maps locally.`,
      );
    } catch {
      clack.log.warning(
        `Failed to create ${chalk.bold(
          '.sentryclirc',
        )} with auth token. Uploading source maps during build will likely not work locally.`,
      );
    }
  }

  await addAuthTokenFileToGitIgnore('.sentryclirc');
}

export async function addDotEnvSentryBuildPluginFile(
  authToken: string,
): Promise<void> {
  const DOT_ENV_FILE = '.env.sentry-build-plugin';

  const envVarContent = `# DO NOT commit this file to your repository!
# The SENTRY_AUTH_TOKEN variable is picked up by the Sentry Build Plugin.
# It's used for authentication when uploading source maps.
# You can also set this env variable in your own \`.env\` files and remove this file.
SENTRY_AUTH_TOKEN="${authToken}"
`;

  const dotEnvFilePath = path.join(process.cwd(), DOT_ENV_FILE);
  const dotEnvFileExists = fs.existsSync(dotEnvFilePath);

  if (dotEnvFileExists) {
    const dotEnvFileContent = fs.readFileSync(dotEnvFilePath, 'utf8');

    const hasAuthToken = !!dotEnvFileContent.match(
      /^\s*SENTRY_AUTH_TOKEN\s*=/g,
    );

    if (hasAuthToken) {
      clack.log.warn(
        `${chalk.bold(DOT_ENV_FILE)} already has auth token. Will not add one.`,
      );
    } else {
      try {
        await fs.promises.writeFile(
          dotEnvFilePath,
          `${dotEnvFileContent}\n${envVarContent}`,
          {
            encoding: 'utf8',
            flag: 'w',
          },
        );
        clack.log.success(`Added auth token to ${chalk.bold(DOT_ENV_FILE)}`);
      } catch {
        clack.log.warning(
          `Failed to add auth token to ${chalk.bold(
            DOT_ENV_FILE,
          )}. Uploading source maps during build will likely not work locally.`,
        );
      }
    }
  } else {
    try {
      await fs.promises.writeFile(dotEnvFilePath, envVarContent, {
        encoding: 'utf8',
        flag: 'w',
      });
      clack.log.success(
        `Created ${chalk.bold(
          DOT_ENV_FILE,
        )} with auth token for you to test source map uploading locally.`,
      );
    } catch {
      clack.log.warning(
        `Failed to create ${chalk.bold(
          DOT_ENV_FILE,
        )} with auth token. Uploading source maps during build will likely not work locally.`,
      );
    }
  }

  await addAuthTokenFileToGitIgnore(DOT_ENV_FILE);
}

async function addAuthTokenFileToGitIgnore(filename: string): Promise<void> {
  //TODO: Add a check to see if the file is already ignored in .gitignore
  try {
    await fs.promises.appendFile(
      path.join(process.cwd(), '.gitignore'),
      `\n# Sentry Auth Token\n${filename}\n`,
      { encoding: 'utf8' },
    );
    clack.log.success(
      `Added ${chalk.bold(filename)} to ${chalk.bold('.gitignore')}.`,
    );
  } catch {
    clack.log.error(
      `Failed adding ${chalk.bold(filename)} to ${chalk.bold(
        '.gitignore',
      )}. Please add it manually!`,
    );
  }
}

export async function ensurePackageIsInstalled(
  packageJson: PackageDotJson,
  packageId: string,
  packageName: string,
) {
  if (!hasPackageInstalled(packageId, packageJson)) {
    const continueWithoutPackage = await abortIfCancelled(
      clack.confirm({
        message: `${packageName} does not seem to be installed. Do you still want to continue?`,
        initialValue: false,
      }),
    );

    if (!continueWithoutPackage) {
      await abort(undefined, 0);
    }
  }
}

export async function getPackageDotJson(): Promise<PackageDotJson> {
  const packageJsonFileContents = await fs.promises
    .readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    .catch(() => {
      clack.log.error(
        'Could not find package.json. Make sure to run the wizard in the root of your app!',
      );
      return abort();
    });

  let packageJson: PackageDotJson | undefined = undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    packageJson = JSON.parse(packageJsonFileContents);
  } catch {
    clack.log.error(
      'Unable to parse your package.json. Make sure it has a valid format!',
    );

    await abort();
  }

  return packageJson || {};
}

async function getPackageManager(): Promise<string> {
  const detectedPackageManager = detectPackageManager();

  if (detectedPackageManager) {
    return detectedPackageManager;
  }

  const selectedPackageManager: string | symbol = await abortIfCancelled(
    clack.select({
      message: 'Please select your package manager.',
      options: [
        { value: 'npm', label: 'Npm' },
        { value: 'yarn', label: 'Yarn' },
        { value: 'pnpm', label: 'Pnpm' },
      ],
    }),
  );

  Sentry.setTag('package-manager', selectedPackageManager);

  return selectedPackageManager;
}

export function detectPackageManager(): 'yarn' | 'npm' | 'pnpm' | undefined {
  if (fs.existsSync(path.join(process.cwd(), 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(process.cwd(), 'package-lock.json'))) {
    return 'npm';
  }
  if (fs.existsSync(path.join(process.cwd(), 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  return undefined;
}

export function isUsingTypeScript() {
  try {
    return fs.existsSync(path.join(process.cwd(), 'tsconfig.json'));
  } catch {
    return false;
  }
}
