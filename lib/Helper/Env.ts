const readEnv = require('read-env').default;

export function readEnvironment(): Record<string, unknown> {
  const result = readEnv('SENTRY_WIZARD');
  return result;
}
