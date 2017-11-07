import * as Step from './steps';
import { startWizard, green } from './Helper';

export function run(argv: any) {
  startWizard(
    argv,
    Step.Initial,
    Step.Welcome,
    Step.DetectProjectType,
    Step.OpenSentry,
    Step.WaitForSentry,
    Step.SentryProjectSelector,
    Step.Result
  );
}
