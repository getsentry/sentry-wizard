import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiagnosticResult } from '../types';

export function checkSentryCliRc({
  projectDir,
}: {
  projectDir: string;
}): DiagnosticResult {
  const rcPath = path.join(projectDir, '.sentryclirc');

  if (!fs.existsSync(rcPath)) {
    if (process.env.SENTRY_AUTH_TOKEN) {
      return {
        name: '.sentryclirc / Auth Token',
        status: 'pass',
        message:
          'No .sentryclirc found, but SENTRY_AUTH_TOKEN environment variable is set.',
        fixAvailable: false,
      };
    }

    return {
      name: '.sentryclirc / Auth Token',
      status: 'fail',
      message:
        'No .sentryclirc found and SENTRY_AUTH_TOKEN is not set. dSYM uploads will fail.',
      fixAvailable: false,
    };
  }

  const content = fs.readFileSync(rcPath, 'utf8');
  if (
    !content.includes('token=') ||
    content.includes('token=\n') ||
    content.includes('token=_YOUR')
  ) {
    return {
      name: '.sentryclirc / Auth Token',
      status: 'warn',
      message:
        '.sentryclirc exists but appears to have an invalid or placeholder auth token.',
      fixAvailable: false,
    };
  }

  return {
    name: '.sentryclirc / Auth Token',
    status: 'pass',
    message: '.sentryclirc exists and contains an auth token.',
    fixAvailable: false,
  };
}
