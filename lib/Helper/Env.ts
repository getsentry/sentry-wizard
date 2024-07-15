const readEnv = require('read-env').default;

// TODO: move to src/utils (+tests)
export function readEnvironment(): Record<string, unknown> {
  const result = readEnv('SENTRY_WIZARD');
  return result;
}
