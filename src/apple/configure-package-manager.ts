import * as Sentry from '@sentry/node';

import { debug } from '../utils/debug';

export function configurePackageManager({
  projectDir: _projectDir,
}: {
  projectDir: string;
}) {
  debug('Using Swift Package Manager (SPM) as the package manager');
  Sentry.setTag('package-manager', 'SPM');

  return { shouldUseSPM: true };
}
