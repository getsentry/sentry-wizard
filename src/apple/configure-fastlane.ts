// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import pc from 'picocolors';
import { traceStep } from '../telemetry';
import { debug } from '../utils/debug';
import * as fastlane from './fastlane';

export async function configureFastlane({
  projectDir,
  orgSlug,
  projectSlug,
}: {
  projectDir: string;
  orgSlug: string;
  projectSlug: string;
}) {
  debug(`Checking if Fastfile exists in directory: ${pc.cyan(projectDir)}`);
  const isFastlaneAvailable = fastlane.fastFile(projectDir);
  Sentry.setTag('fastlane-exists', isFastlaneAvailable);
  if (!isFastlaneAvailable) {
    debug(`Fastfile not found, not configuring Fastlane`);
    // If fastlane is not available, we don't need to configure it and exit early.
    return;
  }

  debug(`Fastfile found, asking user if they want to configure Fastlane`);
  const shouldAddLane = await clack.confirm({
    message:
      'Found a Fastfile in your project. Do you want to configure a lane to upload debug symbols to Sentry?',
  });
  debug(`User wants to add lane: ${pc.cyan(shouldAddLane.toString())}`);
  Sentry.setTag('fastlane-desired', shouldAddLane);

  if (shouldAddLane) {
    debug(`Adding Sentry lane to Fastlane`);
    const added = await traceStep('Configure fastlane', () =>
      fastlane.addSentryToFastlane(projectDir, orgSlug, projectSlug),
    );
    Sentry.setTag('fastlane-added', added);
    debug(`Fastlane added: ${pc.cyan(added.toString())}`);

    if (added) {
      clack.log.step(
        'A new step was added to your fastlane file. Now and you build your project with fastlane, debug symbols and source context will be uploaded to Sentry.',
      );
    } else {
      clack.log.warn(
        'Could not edit your fastlane file to upload debug symbols to Sentry. Please follow the instructions at https://docs.sentry.io/platforms/apple/guides/ios/dsym/#fastlane',
      );
    }
  }
}
