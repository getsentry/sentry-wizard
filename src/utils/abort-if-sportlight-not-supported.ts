// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { abort } from './clack';

/**
 * Aborts the wizard with a message that Spotlight mode is not yet supported
 * for the given platform.
 */
export async function abortIfSpotlightNotSupported(
  platform: string,
): Promise<never> {
  clack.log.warn(`Spotlight mode is not yet supported for ${platform}.`);
  clack.log.info('Spotlight is currently only available for Next.js.');

  return abort('Exiting wizard', 0);
}
