import pc from 'picocolors';

export function prepareMessage(msg: unknown): string {
  if (typeof msg === 'string') {
    return msg;
  }
  if (msg instanceof Error) {
    return `${msg.stack || ''}`;
  }
  return JSON.stringify(msg, null, '\t');
}

export function l(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

export function nl(): void {
  return l('');
}

export function green(msg: string): void {
  return l(pc.green(prepareMessage(msg)));
}

export function red(msg: string): void {
  return l(pc.red(prepareMessage(msg)));
}

export function dim(msg: string): void {
  return l(pc.dim(prepareMessage(msg)));
}

export function yellow(msg: string): void {
  return l(pc.yellow(prepareMessage(msg)));
}

export function cyan(msg: string): void {
  return l(pc.cyan(prepareMessage(msg)));
}

/**
 * @deprecated Use `debug` from `src/utils/debug.ts` instead.
 */
export function debug(msg: unknown): void {
  return l(pc.italic(pc.yellow(prepareMessage(msg))));
}
