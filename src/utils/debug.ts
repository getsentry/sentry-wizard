// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { prepareMessage } from '../../lib/Helper/Logging';

let debugEnabled = false;

export function debug(...args: unknown[]) {
  if (!debugEnabled) {
    return;
  }

  const msg = args.map((a) => prepareMessage(a)).join(' ');

  clack.log.info(pc.dim(msg));
}

export function enableDebugLogs() {
  debugEnabled = true;
}
