import * as bash from '../../../utils/bash';
import type { DiagnosticResult } from '../types';

export function checkSentryCli(): DiagnosticResult {
  const hasCli = bash.hasSentryCLI();

  if (hasCli) {
    return {
      name: 'sentry-cli',
      status: 'pass',
      message: 'sentry-cli is installed and available.',
      fixAvailable: false,
    };
  }

  return {
    name: 'sentry-cli',
    status: 'fail',
    message: 'sentry-cli is not installed. dSYM uploads will fail.',
    fixAvailable: true,
    fix: async () => {
      try {
        await bash.installSentryCLI();
        return true;
      } catch {
        return false;
      }
    },
  };
}
