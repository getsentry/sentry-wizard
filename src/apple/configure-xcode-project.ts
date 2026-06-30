import { traceStep } from '../telemetry';
import { SentryProjectData } from '../utils/types';
import { XcodeProject } from './xcode-manager';

export function configureXcodeProject({
  xcProject,
  project,
  target,
}: {
  xcProject: XcodeProject;
  project: SentryProjectData;
  target: string;
}) {
  traceStep('Update Xcode project', () => {
    xcProject.updateXcodeProject(project, target, true, true);
  });
}
