// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import { withTelemetry } from '../../telemetry';
import { abortIfCancelled, printWelcome } from '../../utils/clack';
import { lookupXcodeProject } from '../lookup-xcode-project';
import type { AppleWizardOptions } from '../options';
import { checkBuildPhase } from './checks/check-build-phase';
import { checkCodeInit } from './checks/check-code-init';
import { checkSdkVersion } from './checks/check-sdk-version';
import { checkSentryCli } from './checks/check-sentry-cli';
import { checkSentryCliRc } from './checks/check-sentryclirc';
import type { DiagnosticResult } from './types';

export async function runAppleDoctorWizard(
  options: AppleWizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'ios',
      wizardOptions: options,
    },
    () => runAppleDoctorWithTelemetry(options),
  );
}

async function runAppleDoctorWithTelemetry(
  options: AppleWizardOptions,
): Promise<void> {
  const projectDir = options.projectDir ?? process.cwd();

  printWelcome({ wizardName: 'Sentry Apple Doctor' });

  const { xcProject, target } = await lookupXcodeProject({ projectDir });

  clack.log.info('Running diagnostic checks...\n');

  const results: DiagnosticResult[] = [
    checkSentryCli(),
    checkSentryCliRc({ projectDir }),
    await checkSdkVersion({ xcProject }),
    checkBuildPhase({ xcProject, target }),
    checkCodeInit({ xcProject, target }),
  ];

  let hasFailures = false;
  let hasFixable = false;

  for (const result of results) {
    if (result.status === 'pass') {
      clack.log.success(
        `${chalk.green('PASS')} ${result.name}: ${result.message}`,
      );
    } else if (result.status === 'warn') {
      clack.log.warn(
        `${chalk.yellow('WARN')} ${result.name}: ${result.message}`,
      );
    } else {
      clack.log.error(`${chalk.red('FAIL')} ${result.name}: ${result.message}`);
      hasFailures = true;
    }

    if (result.fixAvailable && result.status !== 'pass') {
      hasFixable = true;
    }
  }

  if (hasFixable) {
    const shouldFix = await abortIfCancelled(
      clack.confirm({
        message: 'Would you like to attempt to fix the issues found?',
      }),
    );

    if (shouldFix) {
      for (const result of results) {
        if (result.fixAvailable && result.status !== 'pass' && result.fix) {
          clack.log.step(`Fixing: ${result.name}...`);
          const fixed = await result.fix();
          if (fixed) {
            clack.log.success(`Fixed: ${result.name}`);
          } else {
            clack.log.warn(`Could not automatically fix: ${result.name}`);
          }
        }
      }
    }
  } else if (!hasFailures) {
    clack.log.success(
      'All checks passed! Your Sentry integration looks healthy.',
    );
  }
}
