const readEnv = require('read-env').default;

export function readEnvironment(): object {
  const result = readEnv('SENTRY_WIZARD');
  if (result.skipConnect) {
    result['skip-connect'] = result.skipConnect;
    delete result.skipConnect;
  }
  return result;
}
