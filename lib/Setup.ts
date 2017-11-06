import Welcome from './steps/Welcome';
import OpenSentry from './steps/OpenSentry';
import WaitForSentry from './steps/WaitForSentry';
import Initial from './steps/Initial';
import PromptTest from './steps/PromptTest';
import ProjectSelector from './steps/ProjectSelector';
import {startWizard, green} from './Helper';

export function setupCordova(argv: any) {
  startWizard(argv,
    Initial,
    Welcome,
    OpenSentry,
    WaitForSentry,
    ProjectSelector,
    Welcome,
    PromptTest,
    Welcome,
    PromptTest,
    Initial
  );
}
