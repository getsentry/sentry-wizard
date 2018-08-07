const readEnv = require('read-env').default;

export function readEnvironment(): object {
  const result = readEnv('SENTRY_WIZARD');
  return result;
}
