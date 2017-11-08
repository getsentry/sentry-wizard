import * as _ from 'lodash';
import { IArgs } from './Constants';
import { green, red, startWizard } from './Helper';
import * as Step from './steps';

export function run(argv: IArgs) {
  let steps = [Step.Initial, Step.Welcome, Step.DetectProjectType];
  if (argv.uninstall === false) {
    steps = _.concat(
      steps,
      Step.OpenSentry,
      Step.WaitForSentry,
      Step.SentryProjectSelector
    );
  }
  steps = _.concat(steps, Step.ConfigureProject, Step.Result);
  startWizard(argv, ...steps);
}
