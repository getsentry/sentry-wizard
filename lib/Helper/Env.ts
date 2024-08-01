/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
const readEnv = require('read-env').default;

// TODO: move to src/utils (+tests)
export function readEnvironment(): Record<string, unknown> {
  const result = readEnv('SENTRY_WIZARD');
  return result;
}
