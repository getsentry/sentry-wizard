// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import axios from 'axios';
import chalk from 'chalk';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { setInterval } from 'timers';
import { URL } from 'url';
import * as Sentry from '@sentry/node';
import { hasPackageInstalled, PackageDotJson } from './package-json';
import { SentryProjectData, WizardOptions } from './types';
import { traceStep } from '../telemetry';
import {
  detectPackageManger,
  PackageManager,
  installPackageWithPackageManager,
  packageManagers,
} from './package-manager';

const opn = require('opn') as (
  url: string,
) => Promise<childProcess.ChildProcess>;

export const SENTRY_DOT_ENV_FILE = '.env.sentry-build-plugin';
export const SENTRY_CLI_RC_FILE = '.sentryclirc';
export const SENTRY_PROPERTIES_FILE = 'sentry.properties';

const SAAS_URL = 'https://sentry.io/';

interface WizardProjectData {
  apiKeys: {
    token: string;
  };
  projects: SentryProjectData[];
}

export interface CliSetupConfig {
  filename: string;
  name: string;

  likelyAlreadyHasAuthToken(contents: string): boolean;
  tokenContent(authToken: string): string;

  likelyAlreadyHasOrgAndProject(contents: string): boolean;
  orgAndProjContent(org: string, project: string): string;
}

export const sourceMapsCliSetupConfig: CliSetupConfig = {
  filename: SENTRY_CLI_RC_FILE,
  name: 'source maps',
  likelyAlreadyHasAuthToken: function (contents: string): boolean {
    return !!(contents.includes('[auth]') && contents.match(/token=./g));
  },
  tokenContent: function (authToken: string): string {
    return `[auth]\ntoken=${authToken}`;
  },
  likelyAlreadyHasOrgAndProject: function (contents: string): boolean {
    return !!(
      contents.includes('[defaults]') &&
      contents.match(/org=./g) &&
      contents.match(/project=./g)
    );
  },
  orgAndProjContent: function (org: string, project: string): string {
    return `[defaults]\norg=${org}\nproject=${project}`;
  },
};

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
  telemetryEnabled?: boolean;
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

  if (options.telemetryEnabled) {
    welcomeText += `\n\nYou are using the Sentry Wizard with telemetry enabled. This helps us improve the Wizard.\nYou can disable it at any time by running \`sentry-wizard --disable-telemetry\`.`;
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

export async function askForItemSelection(
  items: string[],
  message: string,
): Promise<{ value: string; index: number }> {
  const selection: { value: string; index: number } | symbol =
    await abortIfCancelled(
      clack.select({
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
    )} with ${chalk.bold(packageManager.label)}.`,
  );

  try {
    await installPackageWithPackageManager(packageManager, packageName);
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
    )} with ${chalk.bold(packageManager.label)}.`,
  );
}

async function addOrgAndProjectToSentryCliRc(
  org: string,
  project: string,
  setupConfig: CliSetupConfig,
): Promise<void> {
  const configContents = fs.readFileSync(
    path.join(process.cwd(), setupConfig.filename),
    'utf8',
  );

  if (setupConfig.likelyAlreadyHasOrgAndProject(configContents)) {
    clack.log.warn(
      `${chalk.bold(
        setupConfig.filename,
      )} already has org and project. Will not add them.`,
    );
  } else {
    try {
      await fs.promises.appendFile(
        path.join(process.cwd(), setupConfig.filename),
        `\n${setupConfig.orgAndProjContent(org, project)}\n`,
      );
    } catch (e) {
      clack.log.warn(
        `${chalk.bold(
          setupConfig.filename,
        )} could not be updated with org and project.`,
      );
    }
  }
}

export async function addSentryCliConfig(
  authToken: string,
  setupConfig: CliSetupConfig = sourceMapsCliSetupConfig,
  orgSlug?: string,
  projectSlug?: string,
): Promise<void> {
  const configExists = fs.existsSync(
    path.join(process.cwd(), setupConfig.filename),
  );
  if (configExists) {
    const configContents = fs.readFileSync(
      path.join(process.cwd(), setupConfig.filename),
      'utf8',
    );

    if (setupConfig.likelyAlreadyHasAuthToken(configContents)) {
      clack.log.warn(
        `${chalk.bold(
          setupConfig.filename,
        )} already has auth token. Will not add one.`,
      );
    } else {
      try {
        await fs.promises.writeFile(
          path.join(process.cwd(), setupConfig.filename),
          `${configContents}\n${setupConfig.tokenContent(authToken)}\n`,
          { encoding: 'utf8', flag: 'w' },
        );
        clack.log.success(
          chalk.greenBright(
            `Added auth token to ${chalk.bold(
              setupConfig.filename,
            )} for you to test uploading ${setupConfig.name} locally.`,
          ),
        );
      } catch {
        clack.log.warning(
          `Failed to add auth token to ${chalk.bold(
            setupConfig.filename,
          )}. Uploading ${
            setupConfig.name
          } during build will likely not work locally.`,
        );
      }
    }
  } else {
    try {
      await fs.promises.writeFile(
        path.join(process.cwd(), setupConfig.filename),
        `${setupConfig.tokenContent(authToken)}\n`,
        { encoding: 'utf8', flag: 'w' },
      );
      clack.log.success(
        chalk.greenBright(
          `Created ${chalk.bold(
            setupConfig.filename,
          )} with auth token for you to test uploading ${
            setupConfig.name
          } locally.`,
        ),
      );
    } catch {
      clack.log.warning(
        `Failed to create ${chalk.bold(
          setupConfig.filename,
        )} with auth token. Uploading ${
          setupConfig.name
        } during build will likely not work locally.`,
      );
    }
  }

  if (orgSlug && projectSlug) {
    await addOrgAndProjectToSentryCliRc(orgSlug, projectSlug, setupConfig);
  }

  await addAuthTokenFileToGitIgnore(setupConfig.filename);
}

export async function addDotEnvSentryBuildPluginFile(
  authToken: string,
): Promise<void> {
  const envVarContent = `# DO NOT commit this file to your repository!
# The SENTRY_AUTH_TOKEN variable is picked up by the Sentry Build Plugin.
# It's used for authentication when uploading source maps.
# You can also set this env variable in your own \`.env\` files and remove this file.
SENTRY_AUTH_TOKEN="${authToken}"
`;

  const dotEnvFilePath = path.join(process.cwd(), SENTRY_DOT_ENV_FILE);
  const dotEnvFileExists = fs.existsSync(dotEnvFilePath);

  if (dotEnvFileExists) {
    const dotEnvFileContent = fs.readFileSync(dotEnvFilePath, 'utf8');

    const hasAuthToken = !!dotEnvFileContent.match(
      /^\s*SENTRY_AUTH_TOKEN\s*=/g,
    );

    if (hasAuthToken) {
      clack.log.warn(
        `${chalk.bold(
          SENTRY_DOT_ENV_FILE,
        )} already has auth token. Will not add one.`,
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
        clack.log.success(
          `Added auth token to ${chalk.bold(SENTRY_DOT_ENV_FILE)}`,
        );
      } catch {
        clack.log.warning(
          `Failed to add auth token to ${chalk.bold(
            SENTRY_DOT_ENV_FILE,
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
          SENTRY_DOT_ENV_FILE,
        )} with auth token for you to test source map uploading locally.`,
      );
    } catch {
      clack.log.warning(
        `Failed to create ${chalk.bold(
          SENTRY_DOT_ENV_FILE,
        )} with auth token. Uploading source maps during build will likely not work locally.`,
      );
    }
  }

  await addAuthTokenFileToGitIgnore(SENTRY_DOT_ENV_FILE);
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
      chalk.greenBright(
        `Added ${chalk.bold(filename)} to ${chalk.bold('.gitignore')}.`,
      ),
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

async function getPackageManager(): Promise<PackageManager> {
  const detectedPackageManager = detectPackageManger();

  if (detectedPackageManager) {
    return detectedPackageManager;
  }

  const selectedPackageManager: PackageManager | symbol =
    await abortIfCancelled(
      clack.select({
        message: 'Please select your package manager.',
        options: packageManagers.map((packageManager) => ({
          value: packageManager,
          label: packageManager.label,
        })),
      }),
    );

  Sentry.setTag('package-manager', selectedPackageManager.name);

  return selectedPackageManager;
}

export function isUsingTypeScript() {
  try {
    return fs.existsSync(path.join(process.cwd(), 'tsconfig.json'));
  } catch {
    return false;
  }
}

/**
 * Checks if we already got project data from a previous wizard invocation.
 * If yes, this data is returned.
 * Otherwise, we start the login flow and ask the user to select a project.
 *
 * Use this function to get project data for the wizard.
 *
 * @param options wizard options
 * @param platform the platform of the wizard
 * @returns project data (org, project, token, url)
 */
export async function getOrAskForProjectData(
  options: WizardOptions,
  platform?:
    | 'javascript-nextjs'
    | 'javascript-remix'
    | 'javascript-sveltekit'
    | 'apple-ios'
    | 'android',
): Promise<{
  sentryUrl: string;
  selfHosted: boolean;
  selectedProject: SentryProjectData;
  authToken: string;
}> {
  if (options.preSelectedProject) {
    return {
      selfHosted: options.preSelectedProject.selfHosted,
      sentryUrl: options.url ?? SAAS_URL,
      authToken: options.preSelectedProject.authToken,
      selectedProject: options.preSelectedProject.project,
    };
  }
  const { url: sentryUrl, selfHosted } = await traceStep(
    'ask-self-hosted',
    () => askForSelfHosted(options.url),
  );

  const { projects, apiKeys } = await traceStep('login', () =>
    askForWizardLogin({
      promoCode: options.promoCode,
      url: sentryUrl,
      platform: platform,
    }),
  );

  if (!projects || !projects.length) {
    clack.log.error(
      'No projects found. Please create a project in Sentry and try again.',
    );
    Sentry.setTag('no-projects-found', true);
    await abort();
  }

  const selectedProject = await traceStep('select-project', () =>
    askForProjectSelection(projects),
  );

  return {
    sentryUrl,
    selfHosted,
    authToken: apiKeys.token,
    selectedProject,
  };
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
async function askForSelfHosted(urlFromArgs?: string): Promise<{
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

async function askForWizardLogin(options: {
  url: string;
  promoCode?: string;
  platform?:
    | 'javascript-nextjs'
    | 'javascript-remix'
    | 'javascript-sveltekit'
    | 'apple-ios'
    | 'android';
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

  loginSpinner.start('Waiting for you to log in using the link above');

  const data = await new Promise<WizardProjectData>((resolve) => {
    const pollingInterval = setInterval(() => {
      axios
        .get<WizardProjectData>(`${options.url}api/0/wizard/${wizardHash}/`, {
          headers: {
            'Accept-Encoding': 'deflate',
          },
        })
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

async function askForProjectSelection(
  projects: SentryProjectData[],
): Promise<SentryProjectData> {
  const label = (project: SentryProjectData): string => {
    return `${project.organization.slug}/${project.slug}`;
  };
  const sortedProjects = [...projects];
  sortedProjects.sort((a: SentryProjectData, b: SentryProjectData) => {
    return label(a).localeCompare(label(b));
  });
  const selection: SentryProjectData | symbol = await abortIfCancelled(
    clack.select({
      maxItems: 12,
      message: 'Select your Sentry project.',
      options: sortedProjects.map((project) => {
        return {
          value: project,
          label: label(project),
        };
      }),
    }),
  );

  Sentry.setTag('project', selection.slug);
  Sentry.setTag('project-platform', selection.platform);
  Sentry.setUser({ id: selection.organization.slug });

  return selection;
}
