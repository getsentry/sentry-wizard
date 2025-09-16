import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { gte, minVersion } from 'semver';

import type { PackageDotJson } from '../utils/package-json';
import { getPackageVersion } from '../utils/package-json';
import { debug } from '../utils/debug';
import { showCopyPasteInstructions } from '../utils/clack';
import {
  getSentryInitClientContent,
  SENTRY_INIT_SERVER_CONTENT,
  getSentryInstrumentationServerContent,
  ERROR_BOUNDARY_TEMPLATE,
  getManualClientEntryContent,
  getManualServerEntryContent,
  getManualRootContent,
} from './templates';

const REACT_ROUTER_REVEAL_COMMAND = 'npx react-router reveal';

async function tryRevealAndGetManualInstructions(
  missingFilename: string,
  filePath: string,
  getManualContent: () => string,
  instructionPrefix = 'Please create',
): Promise<boolean> {
  // Ask if user wants to try running reveal again
  const shouldTryReveal = await clack.confirm({
    message: `Would you like to try running ${chalk.cyan(
      REACT_ROUTER_REVEAL_COMMAND,
    )} to generate entry files?`,
    initialValue: true,
  });

  if (shouldTryReveal) {
    try {
      clack.log.info(`Running ${chalk.cyan(REACT_ROUTER_REVEAL_COMMAND)}...`);
      const output = childProcess.execSync(REACT_ROUTER_REVEAL_COMMAND, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      clack.log.info(output);

      // Check if the file exists now
      if (fs.existsSync(filePath)) {
        clack.log.success(
          `Found ${chalk.cyan(missingFilename)} after running reveal.`,
        );
        return true; // File now exists, continue with normal flow
      } else {
        clack.log.warn(
          `${chalk.cyan(
            missingFilename,
          )} still not found after running reveal.`,
        );
      }
    } catch (error) {
      debug('Failed to run React Router reveal command:', error);
      clack.log.error(
        `Failed to run ${chalk.cyan(REACT_ROUTER_REVEAL_COMMAND)}.`,
      );
    }
  }

  // Fall back to manual instructions (either user declined or reveal failed)
  await showCopyPasteInstructions({
    instructions: `${instructionPrefix} ${chalk.cyan(
      missingFilename,
    )} with the following content:`,
    codeSnippet: getManualContent(),
  });

  return false; // File still doesn't exist, manual intervention needed
}

export function runReactRouterReveal(isTS: boolean): void {
  // Check if entry files already exist
  const clientEntryFilename = `entry.client.${isTS ? 'tsx' : 'jsx'}`;
  const serverEntryFilename = `entry.server.${isTS ? 'tsx' : 'jsx'}`;

  const clientEntryPath = path.join(process.cwd(), 'app', clientEntryFilename);
  const serverEntryPath = path.join(process.cwd(), 'app', serverEntryFilename);

  if (fs.existsSync(clientEntryPath) && fs.existsSync(serverEntryPath)) {
    clack.log.info(
      `Found entry files ${chalk.cyan(clientEntryFilename)} and ${chalk.cyan(
        serverEntryFilename,
      )}.`,
    );
  } else {
    clack.log.info(
      `Couldn't find entry files in your project. Trying to run ${chalk.cyan(
        REACT_ROUTER_REVEAL_COMMAND,
      )}...`,
    );

    try {
      const output = childProcess.execSync(REACT_ROUTER_REVEAL_COMMAND, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      clack.log.info(output);
    } catch (error) {
      debug('Failed to run React Router reveal command:', error);
      clack.log.error(
        `Failed to run ${chalk.cyan(
          REACT_ROUTER_REVEAL_COMMAND,
        )}. Please run it manually to generate entry files.`,
      );
      throw error;
    }
  }
}

export function isReactRouterV7(packageJson: PackageDotJson): boolean {
  const reactRouterVersion = getPackageVersion(
    '@react-router/dev',
    packageJson,
  );
  if (!reactRouterVersion) {
    return false;
  }

  const minVer = minVersion(reactRouterVersion);

  if (!minVer) {
    return false;
  }

  return gte(minVer, '7.0.0');
}

export async function initializeSentryOnEntryClient(
  dsn: string,
  enableTracing: boolean,
  enableReplay: boolean,
  enableLogs: boolean,
  isTS: boolean,
): Promise<void> {
  const clientEntryFilename = `entry.client.${isTS ? 'tsx' : 'jsx'}`;
  const clientEntryPath = path.join(process.cwd(), 'app', clientEntryFilename);

  try {
    if (!fs.existsSync(clientEntryPath)) {
      clack.log.warn(`Could not find ${chalk.cyan(clientEntryFilename)}.`);

      const fileExists = await tryRevealAndGetManualInstructions(
        clientEntryFilename,
        clientEntryPath,
        () =>
          getManualClientEntryContent(
            dsn,
            enableTracing,
            enableReplay,
            enableLogs,
          ),
      );

      if (!fileExists) {
        return; // File still doesn't exist after reveal attempt, manual instructions shown
      }
    }

    const content = fs.readFileSync(clientEntryPath, 'utf8');
    const sentryInitCode = getSentryInitClientContent(
      dsn,
      enableTracing,
      enableReplay,
      enableLogs,
    );

    // Insert Sentry initialization at the top
    const updatedContent = `${sentryInitCode}\n\n${content}`;

    try {
      fs.writeFileSync(clientEntryPath, updatedContent);
      clack.log.success(
        `Updated ${chalk.cyan(
          clientEntryFilename,
        )} with Sentry initialization.`,
      );
    } catch (writeError) {
      debug('Failed to write client entry file:', writeError);
      clack.log.warn(
        `Failed to automatically update ${chalk.cyan(clientEntryFilename)}.`,
      );

      await showCopyPasteInstructions({
        instructions: `Please add the following to the top of your ${chalk.cyan(
          clientEntryFilename,
        )} file:`,
        codeSnippet: getManualClientEntryContent(
          dsn,
          enableTracing,
          enableReplay,
          enableLogs,
        ),
      });
    }
  } catch (error) {
    debug('Error in initializeSentryOnEntryClient:', error);
    clack.log.error(
      `Failed to read ${chalk.cyan(
        clientEntryFilename,
      )}. Please add Sentry initialization manually.`,
    );

    // Still provide manual instructions even if there's an error
    await showCopyPasteInstructions({
      instructions: `Please create ${chalk.cyan(
        clientEntryFilename,
      )} with the following content:`,
      codeSnippet: getManualClientEntryContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      ),
    });
  }
}

export async function instrumentRootRoute(isTS: boolean): Promise<void> {
  const rootFilename = `root.${isTS ? 'tsx' : 'jsx'}`;
  const rootPath = path.join(process.cwd(), 'app', rootFilename);

  try {
    if (!fs.existsSync(rootPath)) {
      clack.log.warn(`Could not find ${chalk.cyan(rootFilename)}.`);

      // For root route, we don't offer to run reveal since it's a different file
      // Just provide manual instructions
      await showCopyPasteInstructions({
        instructions: `Please update your ${chalk.cyan(
          rootFilename,
        )} file with the following changes:`,
        codeSnippet: getManualRootContent(),
      });
      return;
    }

    const content = fs.readFileSync(rootPath, 'utf8');

    // Add Sentry import if not present
    let updatedContent = content;
    if (!content.includes('import * as Sentry from "@sentry/react-router"')) {
      updatedContent = `import * as Sentry from "@sentry/react-router";\nimport { isRouteErrorResponse } from "react-router";\n\n${updatedContent}`;
    }

    // Add ErrorBoundary if not present
    if (!content.includes('export function ErrorBoundary')) {
      updatedContent = `${updatedContent}\n\n${ERROR_BOUNDARY_TEMPLATE}`;
    }

    try {
      fs.writeFileSync(rootPath, updatedContent);
      clack.log.success(
        `Updated ${chalk.cyan(rootFilename)} with ErrorBoundary.`,
      );
    } catch (writeError) {
      debug('Failed to write root file:', writeError);
      clack.log.warn(
        `Failed to automatically update ${chalk.cyan(rootFilename)}.`,
      );

      await showCopyPasteInstructions({
        instructions: `Please update your ${chalk.cyan(
          rootFilename,
        )} file with the following changes:`,
        codeSnippet: getManualRootContent(),
      });
    }
  } catch (error) {
    debug('Error in instrumentRootRoute:', error);
    clack.log.error(
      `Failed to read ${chalk.cyan(
        rootFilename,
      )}. Please add ErrorBoundary manually.`,
    );

    // Still provide manual instructions even if there's an error
    await showCopyPasteInstructions({
      instructions: `Please update your ${chalk.cyan(
        rootFilename,
      )} file with the following changes:`,
      codeSnippet: getManualRootContent(),
    });
  }
}

export function createServerInstrumentationFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
): string | null {
  const instrumentationPath = path.join(
    process.cwd(),
    'instrumentation.server.mjs',
  );

  try {
    const content = getSentryInstrumentationServerContent(
      dsn,
      selectedFeatures.performance,
    );

    fs.writeFileSync(instrumentationPath, content);
    clack.log.success(`Created ${chalk.cyan('instrumentation.server.mjs')}.`);
    return instrumentationPath;
  } catch (error) {
    debug('Failed to create server instrumentation file:', error);
    clack.log.error(
      `Failed to create ${chalk.cyan(
        'instrumentation.server.mjs',
      )}. Please create it manually.`,
    );
    return null;
  }
}

export function insertServerInstrumentationFile(): boolean {
  // Check if there's a custom server file
  const serverFiles = ['server.mjs', 'server.js', 'server.ts'];

  for (const serverFile of serverFiles) {
    const serverPath = path.join(process.cwd(), serverFile);

    if (!fs.existsSync(serverPath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(serverPath, 'utf8');

      // Add instrumentation import if not present
      if (content.includes("import './instrumentation.server.mjs'")) {
        clack.log.info(
          `${chalk.cyan(serverFile)} already has instrumentation import.`,
        );
        return true;
      }

      const updatedContent = `import './instrumentation.server.mjs';\n${content}`;

      try {
        fs.writeFileSync(serverPath, updatedContent);
        clack.log.success(
          `Updated ${chalk.cyan(serverFile)} with instrumentation import.`,
        );
        return true;
      } catch (writeError) {
        debug('Failed to write server file:', writeError);
        clack.log.warn(
          `Failed to automatically update ${chalk.cyan(serverFile)}.`,
        );
        // Continue to next file instead of returning false immediately
      }
    } catch (error) {
      debug(`Error processing server file ${serverFile}:`, error);
      clack.log.warn(
        `Failed to read ${chalk.cyan(
          serverFile,
        )}. Checking next server file...`,
      );
      // Continue to next file instead of returning false immediately
    }
  }

  return false;
}

export async function instrumentSentryOnEntryServer(
  isTS: boolean,
): Promise<void> {
  const serverEntryFilename = `entry.server.${isTS ? 'tsx' : 'jsx'}`;
  const serverEntryPath = path.join(process.cwd(), 'app', serverEntryFilename);

  try {
    if (!fs.existsSync(serverEntryPath)) {
      clack.log.warn(`Could not find ${chalk.cyan(serverEntryFilename)}.`);

      const fileExists = await tryRevealAndGetManualInstructions(
        serverEntryFilename,
        serverEntryPath,
        () => getManualServerEntryContent(),
      );

      if (!fileExists) {
        return; // File still doesn't exist after reveal attempt, manual instructions shown
      }
    }

    const content = fs.readFileSync(serverEntryPath, 'utf8');
    const sentryServerCode = SENTRY_INIT_SERVER_CONTENT;

    // Add Sentry import if not present
    let updatedContent = content;
    if (!content.includes('import * as Sentry from "@sentry/react-router"')) {
      updatedContent = `import * as Sentry from "@sentry/react-router";\n\n${updatedContent}`;
    }

    // Add handleError export if not present
    if (!content.includes('export const handleError')) {
      updatedContent = `${updatedContent}\n\n${sentryServerCode}`;
    }

    try {
      fs.writeFileSync(serverEntryPath, updatedContent);
      clack.log.success(
        `Updated ${chalk.cyan(
          serverEntryFilename,
        )} with Sentry error handling.`,
      );
    } catch (writeError) {
      debug('Failed to write server entry file:', writeError);
      clack.log.warn(
        `Failed to automatically update ${chalk.cyan(serverEntryFilename)}.`,
      );

      await showCopyPasteInstructions({
        instructions: `Please add the following to your ${chalk.cyan(
          serverEntryFilename,
        )} file:`,
        codeSnippet: getManualServerEntryContent(),
      });
    }
  } catch (error) {
    debug('Error in instrumentSentryOnEntryServer:', error);
    clack.log.error(
      `Failed to read ${chalk.cyan(
        serverEntryFilename,
      )}. Please add Sentry error handling manually.`,
    );

    // Still provide manual instructions even if there's an error
    await showCopyPasteInstructions({
      instructions: `Please create ${chalk.cyan(
        serverEntryFilename,
      )} with the following content:`,
      codeSnippet: getManualServerEntryContent(),
    });
  }
}
