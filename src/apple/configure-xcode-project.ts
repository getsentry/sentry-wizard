import { traceStep } from '../telemetry';
import { SentryProjectData } from '../utils/types';
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
    xcProject.updateXcodeProject(project, target, shouldUseSPM, true);
  });
}
