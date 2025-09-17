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
import {
  getSentryInitClientContent,
  SENTRY_INIT_SERVER_CONTENT,
  getSentryInstrumentationServerContent,
  ERROR_BOUNDARY_TEMPLATE,
} from './templates';

const REACT_ROUTER_REVEAL_COMMAND = 'npx react-router reveal';

async function tryRevealAndGetManualInstructions(
  missingFilename: string,
  filePath: string,
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

  if (!fs.existsSync(clientEntryPath)) {
    clack.log.warn(`Could not find ${chalk.cyan(clientEntryFilename)}.`);

    const fileExists = await tryRevealAndGetManualInstructions(
      clientEntryFilename,
      clientEntryPath,
    );

    if (!fileExists) {
      throw new Error(`${clientEntryFilename} not found after reveal attempt`);
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

  fs.writeFileSync(clientEntryPath, updatedContent);
  clack.log.success(
    `Updated ${chalk.cyan(clientEntryFilename)} with Sentry initialization.`,
  );
}

export function instrumentRootRoute(isTS: boolean): void {
  const rootFilename = `root.${isTS ? 'tsx' : 'jsx'}`;
  const rootPath = path.join(process.cwd(), 'app', rootFilename);

  if (!fs.existsSync(rootPath)) {
    throw new Error(`${rootFilename} not found`);
  }

  const content = fs.readFileSync(rootPath, 'utf8');

  // Add Sentry import if not present
  let updatedContent = content;

  if (!content.includes('Sentry')) {
    const isRouteErrorResponseExists = content.includes(
      'isRouteErrorResponse',
    );

    // Add Sentry import
    updatedContent = `import * as Sentry from "@sentry/react-router";
${
  isRouteErrorResponseExists
    ? ''
    : 'import { isRouteErrorResponse } from "react-router";\n'
}${updatedContent}`;
  }

  // Add ErrorBoundary if not present
  if (!content.includes('export function ErrorBoundary')) {
    updatedContent = `${updatedContent}\n\n${ERROR_BOUNDARY_TEMPLATE}`;
  }

  fs.writeFileSync(rootPath, updatedContent);
  clack.log.success(`Updated ${chalk.cyan(rootFilename)} with ErrorBoundary.`);
}

export function createServerInstrumentationFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
): string {
  const instrumentationPath = path.join(
    process.cwd(),
    'instrumentation.server.mjs',
  );

  const content = getSentryInstrumentationServerContent(
    dsn,
    selectedFeatures.performance,
  );

  fs.writeFileSync(instrumentationPath, content);
  clack.log.success(`Created ${chalk.cyan('instrumentation.server.mjs')}.`);
  return instrumentationPath;
}

export function insertServerInstrumentationFile(): void {
  // Check if there's a custom server file
  const serverFiles = ['server.mjs', 'server.js', 'server.ts'];

  for (const serverFile of serverFiles) {
    const serverPath = path.join(process.cwd(), serverFile);

    if (!fs.existsSync(serverPath)) {
      continue;
    }

    const content = fs.readFileSync(serverPath, 'utf8');

    // Add instrumentation import if not present
    if (content.includes("import './instrumentation.server")) {
      clack.log.info(
        `${chalk.cyan(serverFile)} already has instrumentation import.`,
      );
      return;
    }

    const updatedContent = `import './instrumentation.server.mjs';\n${content}`;

    fs.writeFileSync(serverPath, updatedContent);
    clack.log.success(
      `Updated ${chalk.cyan(serverFile)} with instrumentation import.`,
    );
    return;
  }

  clack.log.info(
    'No custom server files found. Skipping server instrumentation import step.',
  );
}

export async function instrumentSentryOnEntryServer(
  isTS: boolean,
): Promise<void> {
  const serverEntryFilename = `entry.server.${isTS ? 'tsx' : 'jsx'}`;
  const serverEntryPath = path.join(process.cwd(), 'app', serverEntryFilename);

  if (!fs.existsSync(serverEntryPath)) {
    clack.log.warn(`Could not find ${chalk.cyan(serverEntryFilename)}.`);

    const fileExists = await tryRevealAndGetManualInstructions(
      serverEntryFilename,
      serverEntryPath,
    );

    if (!fileExists) {
      throw new Error(`${serverEntryFilename} not found after reveal attempt`);
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

  fs.writeFileSync(serverEntryPath, updatedContent);
  clack.log.success(
    `Updated ${chalk.cyan(serverEntryFilename)} with Sentry error handling.`,
  );
}
