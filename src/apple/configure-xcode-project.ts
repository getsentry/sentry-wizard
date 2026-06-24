import { traceStep } from '../telemetry';
import { SentryProjectData } from '../utils/types';
import {
  SENTRY_SPM_ALREADY_LINKED_FRAMEWORK_COMMENT,
  sentrySwiftPackageProductSpec,
} from './sentry-swift-package';
import { XcodeProject } from './xcode-manager';

export function configureXcodeProject({
  xcProject,
  project,
  target,
  shouldUseSPM,
}: {
  xcProject: XcodeProject;
  project: SentryProjectData;
  target: string;
  shouldUseSPM: boolean;
}) {
  traceStep('Update Xcode project', () => {
    xcProject.updateXcodeProject(
      project,
      target,
      shouldUseSPM
        ? {
            product: sentrySwiftPackageProductSpec,
            existingFrameworkComment:
              SENTRY_SPM_ALREADY_LINKED_FRAMEWORK_COMMENT,
            successMessage: 'Added Sentry SPM dependency to your project',
          }
        : undefined,
      true,
    );
  });
}
