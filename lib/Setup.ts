import { IArgs } from './Constants';
import { green, red, startWizard } from './Helper';
import * as Step from './steps';

export function run(argv: IArgs) {
  startWizard(
    argv,
    Step.Initial,
    Step.Welcome,
    Step.DetectProjectType,
    Step.OpenSentry,
    Step.WaitForSentry,
    Step.SentryProjectSelector,
    Step.ConfigureProject,
    Step.Result
  );
}
