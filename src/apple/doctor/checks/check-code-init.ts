import * as fs from 'node:fs';
import type { XcodeProject } from '../../xcode-manager';
import type { DiagnosticResult } from '../types';

export function checkCodeInit({
  xcProject,
  target,
}: {
  xcProject: XcodeProject;
  target: string;
}): DiagnosticResult {
  const files = xcProject.getSourceFilesForTarget(target);

  if (!files || files.length === 0) {
    return {
      name: 'Sentry Initialization Code',
      status: 'warn',
      message:
        'Could not resolve source files for the target to check for initialization code.',
      fixAvailable: false,
    };
  }

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    // Check for active (non-commented) Sentry initialization
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
      if (
        trimmed.includes('SentrySDK.start') ||
        trimmed.includes('[SentrySDK start')
      ) {
        return {
          name: 'Sentry Initialization Code',
          status: 'pass',
          message: `Sentry initialization found in ${filePath}.`,
          fixAvailable: false,
        };
      }
    }
  }

  return {
    name: 'Sentry Initialization Code',
    status: 'fail',
    message:
      'No active Sentry initialization code found in source files. SDK will not start.',
    fixAvailable: false,
  };
}
