import * as _ from 'lodash';

import { readEnvironment } from './Helper/Env';
import { startWizard } from './Helper/Wizard';
import * as Step from './Steps';

export async function run(argv: any): Promise<any> {
  const args = { ...argv, ...readEnvironment() };

  if (args.uninstall === undefined) {
    args.uninstall = false;
  }
  let steps = [
    Step.Initial,
    Step.Welcome,
    Step.ChooseIntegration,
    Step.ShouldConfigure,
  ];
  if (args.uninstall === false) {
    steps = _.concat(
      steps,
      Step.OpenSentry,
      Step.WaitForSentry,
      Step.SentryProjectSelector,
      Step.PromptForParameters,
    );
  }
  steps = _.concat(steps, Step.ConfigureProject, Step.Result);
  return startWizard(args, ...steps);
}
