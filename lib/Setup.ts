import * as _ from 'lodash';
import { IArgs } from './Constants';
import { green, red } from './Helper/Logging';
import { startWizard } from './Helper/Wizard';
import * as Step from './Steps';

export async function run(argv: IArgs) {
  let steps = [Step.Initial, Step.Welcome, Step.ChooseProject, Step.ShouldConfigure];
  if (argv.uninstall === false) {
    steps = _.concat(
      steps,
      Step.OpenSentry,
      Step.WaitForSentry,
      Step.SentryProjectSelector
    );
  }
  steps = _.concat(steps, Step.PromptForParameters, Step.ConfigureProject, Step.Result);
  return startWizard(argv, ...steps);
}
